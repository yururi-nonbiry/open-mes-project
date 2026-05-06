from django.db import transaction
from django.db.models import Sum
import logging

from inventory.models import Inventory, SalesOrder
from ..models import MaterialAllocation, PartsUsed

logger = logging.getLogger(__name__)

def allocate_materials_service(production_plan, allocations_data):
    """
    生産計画に対して資材を割り当てるサービス。
    在庫の引き当て更新と MaterialAllocation レコードの作成を行います。
    """
    if not isinstance(allocations_data, list):
        raise ValueError("Allocations data must be a list.")
    if not allocations_data:
        raise ValueError("Allocations list cannot be empty.")

    processed_allocations_summary = []
    errors = []

    # BOM情報の取得（バリデーション用）
    plan_identifier = production_plan.production_plan
    required_parts = {}
    if plan_identifier:
        parts_used = PartsUsed.objects.filter(production_plan=plan_identifier)
        for p in parts_used:
            required_parts[p.part_code] = required_parts.get(p.part_code, 0) + p.quantity_used

    # 既に引き当て済みの数量を取得
    existing_allocations = MaterialAllocation.objects.filter(
        production_plan=production_plan
    ).values('material_code').annotate(total=Sum('allocated_quantity'))
    allocated_map = {a['material_code']: a['total'] for a in existing_allocations}

    with transaction.atomic():
        for alloc_item_data in allocations_data:
            part_number = alloc_item_data.get("part_number")
            warehouse = alloc_item_data.get("warehouse")
            quantity_to_allocate = alloc_item_data.get("quantity_to_allocate")

            if not all([part_number, warehouse, quantity_to_allocate is not None]):
                errors.append(
                    f"Missing data for allocation item (part_number, warehouse, or quantity_to_allocate): {alloc_item_data}"
                )
                continue

            try:
                quantity_to_allocate = int(quantity_to_allocate)
                if quantity_to_allocate <= 0:
                    if quantity_to_allocate < 0:
                        errors.append(f"Quantity to allocate must be non-negative for {part_number}.")
                    continue
            except ValueError:
                errors.append(f"Invalid quantity for {part_number}.")
                continue

            # BOMバリデーション
            if plan_identifier and part_number in required_parts:
                req_qty = required_parts[part_number]
                already_alloc = allocated_map.get(part_number, 0)
                if already_alloc + quantity_to_allocate > req_qty:
                    errors.append(
                        f"Allocation exceeds BOM requirement for {part_number}. "
                        f"Required: {req_qty}, Already Allocated: {already_alloc}, Requesting: {quantity_to_allocate}"
                    )
                    continue
            elif plan_identifier:
                logger.warning(f"Allocating part {part_number} not found in BOM for plan {plan_identifier}")

            try:
                inventory_item = Inventory.objects.select_for_update().get(part_number=part_number, warehouse=warehouse)
            except Inventory.DoesNotExist:
                errors.append(f"Inventory not found for part '{part_number}' in warehouse '{warehouse}'.")
                continue

            if not inventory_item.is_active or not inventory_item.is_allocatable:
                errors.append(
                    f"Inventory for part '{part_number}' in warehouse '{warehouse}' is not active or allocatable."
                )
                continue

            if inventory_item.available_quantity < quantity_to_allocate:
                errors.append(
                    f"Insufficient available stock for part '{part_number}' in warehouse '{warehouse}'. "
                    f"Required: {quantity_to_allocate}, Available: {inventory_item.available_quantity}"
                )
                continue

            # 在庫の引き当て（予約）
            inventory_item.reserved += quantity_to_allocate
            inventory_item.save()

            # MaterialAllocationレコードの作成
            material_allocation = MaterialAllocation.objects.create(
                production_plan=production_plan,
                material_code=part_number,
                warehouse=warehouse,
                allocated_quantity=quantity_to_allocate,
                status="ALLOCATED",
            )

            # 出庫予定（SalesOrder）の作成
            so_order_number = f"INT-{material_allocation.id.hex[:15]}"
            sales_order, so_created = SalesOrder.objects.get_or_create(
                order_number=so_order_number,
                defaults={
                    "item": material_allocation.material_code,
                    "quantity": material_allocation.allocated_quantity,
                    "warehouse": warehouse,
                    "expected_shipment": production_plan.planned_start_datetime,
                    "status": "pending",
                },
            )

            processed_allocations_summary.append(
                {
                    "part_number": part_number,
                    "warehouse": warehouse,
                    "allocated_quantity": quantity_to_allocate,
                    "material_allocation_id": material_allocation.id,
                    "new_inventory_reserved": inventory_item.reserved,
                    "new_inventory_available": inventory_item.available_quantity,
                    "sales_order_id": sales_order.id,
                    "sales_order_number": sales_order.order_number,
                }
            )

        if errors:
            raise ValueError(f"Errors occurred during allocation process: {'; '.join(errors)}")

    return processed_allocations_summary
