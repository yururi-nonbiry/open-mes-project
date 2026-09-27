import logging

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from inventory.models import SalesOrder, StockMovement
from inventory.services import (
    InventoryServiceError,
    add_stock,
    consume_stock,
    lock_inventory_rows,
    release_reserved_fifo,
    reserve_fifo,
    save_rows,
)

from ..models import MaterialAllocation, PartsUsed

logger = logging.getLogger(__name__)


def build_internal_so_order_number(allocation_id):
    """
    MaterialAllocationに対応する内部SalesOrderの注文番号を生成します。
    UUID7は先頭ビットがタイムスタンプで占められ同時刻生成レコード間の
    ランダム性が乏しいため、ランダム性の高い末尾を使用します。
    """
    return f"{SalesOrder.INTERNAL_ORDER_PREFIX}{allocation_id.hex[-15:]}"


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

    # 既に引き当て済みの数量を取得(返却済み(RETURNED)は使われなかった分のため必要数から差し引かない)
    existing_allocations = (
        MaterialAllocation.objects.filter(production_plan=production_plan)
        .exclude(status=MaterialAllocation.Status.RETURNED)
        .values('material_id')
        .annotate(total=Sum('allocated_quantity'))
    )
    allocated_map = {a['material_id']: a['total'] for a in existing_allocations}

    with transaction.atomic():
        for alloc_item_data in allocations_data:
            part_number = alloc_item_data.get("part_number")
            warehouse = alloc_item_data.get("warehouse")
            quantity_to_allocate = alloc_item_data.get("quantity_to_allocate")

            if not all([part_number, warehouse, quantity_to_allocate is not None]):
                errors.append(
                    "Missing data for allocation item (part_number, warehouse, or quantity_to_allocate): "
                    f"{alloc_item_data}"
                )
                continue

            try:
                quantity_to_allocate = int(quantity_to_allocate)
                if quantity_to_allocate <= 0:
                    if quantity_to_allocate < 0:
                        errors.append(f"Quantity to allocate must be non-negative for {part_number}.")
                    continue
            except (TypeError, ValueError):
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

            # 同一品番+倉庫で棚をまたいで在庫が分散している場合は、入庫が古い順に複数の棚から引き当てる
            inventory_rows = lock_inventory_rows(part_number, warehouse)
            if not inventory_rows:
                errors.append(f"Inventory not found for part '{part_number}' in warehouse '{warehouse}'.")
                continue

            eligible_rows = [row for row in inventory_rows if row.is_active and row.is_allocatable]
            if not eligible_rows:
                errors.append(
                    f"Inventory for part '{part_number}' in warehouse '{warehouse}' is not active or allocatable."
                )
                continue

            total_available = sum(row.available_quantity for row in eligible_rows)
            if total_available < quantity_to_allocate:
                errors.append(
                    f"Insufficient available stock for part '{part_number}' in warehouse '{warehouse}'. "
                    f"Required: {quantity_to_allocate}, Available: {total_available}"
                )
                continue

            # 在庫の引き当て（予約）
            reserve_fifo(eligible_rows, quantity_to_allocate)
            # 同一リクエスト内で同じ部品が複数行ある場合もBOM必要数を超えないよう、引当済数量を累積する
            allocated_map[part_number] = allocated_map.get(part_number, 0) + quantity_to_allocate

            # MaterialAllocationレコードの作成
            material_allocation = MaterialAllocation.objects.create(
                production_plan=production_plan,
                material_code=part_number,
                warehouse=warehouse,
                allocated_quantity=quantity_to_allocate,
                status=MaterialAllocation.Status.ALLOCATED,
            )

            # 出庫予定（SalesOrder）の作成
            so_order_number = build_internal_so_order_number(material_allocation.id)
            sales_order, so_created = SalesOrder.objects.get_or_create(
                order_number=so_order_number,
                defaults={
                    "item": material_allocation.material_code,
                    "quantity": material_allocation.allocated_quantity,
                    "warehouse": warehouse,
                    "expected_shipment": production_plan.planned_start_datetime,
                    "status": SalesOrder.Status.PENDING,
                },
            )

            processed_allocations_summary.append(
                {
                    "part_number": part_number,
                    "warehouse": warehouse,
                    "allocated_quantity": quantity_to_allocate,
                    "material_allocation_id": material_allocation.id,
                    "new_inventory_reserved": sum(row.reserved for row in inventory_rows),
                    "new_inventory_available": sum(row.available_quantity for row in inventory_rows),
                    "sales_order_id": sales_order.id,
                    "sales_order_number": sales_order.order_number,
                }
            )

        if errors:
            raise ValueError(f"Errors occurred during allocation process: {'; '.join(errors)}")

    return processed_allocations_summary


def release_material_allocation_service(allocation):
    """
    未出庫（ALLOCATED）の材料引当を解除（削除）します。
    在庫の reserved を解放し、関連する内部SalesOrderをキャンセルします。
    出庫済み(ISSUED)・返却済み(RETURNED)の引当は実在庫の増減を伴う履歴のため削除できません。
    """
    if allocation.status != MaterialAllocation.Status.ALLOCATED:
        raise ValueError(
            f"Cannot delete allocation with status '{allocation.status}'. "
            "Only 'ALLOCATED' allocations can be released."
        )

    with transaction.atomic():
        if allocation.warehouse:
            rows = lock_inventory_rows(allocation.material_code, allocation.warehouse)
            if rows:
                release_reserved_fifo(rows, allocation.allocated_quantity)
                save_rows(rows)
            else:
                logger.error(
                    f"Inventory not found while releasing allocation {allocation.id}: "
                    f"{allocation.material_code} in {allocation.warehouse}"
                )

        so_order_number = build_internal_so_order_number(allocation.id)
        SalesOrder.objects.filter(order_number=so_order_number).update(status=SalesOrder.Status.CANCELED)

        allocation.delete()


def update_material_allocation_status_service(allocation, new_status, user, now=None):
    """
    材料引当のステータスを変更し、実在庫の増減を伴わせるサービス。
    ALLOCATED -> ISSUED: 在庫を出庫（quantity, reserved を減算）。
    ISSUED -> RETURNED: 出庫した在庫を戻す（quantity のみ加算。引当は解除済みのため reserved は戻さない）。
    """
    now = now or timezone.now()
    allowed_transitions = {
        MaterialAllocation.Status.ALLOCATED: MaterialAllocation.Status.ISSUED,
        MaterialAllocation.Status.ISSUED: MaterialAllocation.Status.RETURNED,
    }
    if allowed_transitions.get(allocation.status) != new_status:
        raise ValueError(
            f"Invalid status transition for allocation {allocation.id}: {allocation.status} -> {new_status}."
        )
    if not allocation.warehouse:
        raise ValueError(f"Allocation {allocation.id} has no warehouse; cannot update inventory.")

    so_order_number = build_internal_so_order_number(allocation.id)

    operator = user if user and user.is_authenticated else None

    with transaction.atomic():
        if new_status == MaterialAllocation.Status.ISSUED:
            rows = [
                row for row in lock_inventory_rows(allocation.material_code, allocation.warehouse) if row.is_active
            ]
            if not rows:
                raise ValueError(
                    f"Inventory not found for '{allocation.material_code}' in '{allocation.warehouse}'."
                )
            try:
                consumed, _ = consume_stock(
                    rows, allocation.allocated_quantity, own_reserved=allocation.allocated_quantity
                )
            except InventoryServiceError as e:
                raise ValueError(
                    f"Insufficient stock to issue '{allocation.material_code}' in '{allocation.warehouse}'. "
                    f"{e.message}"
                ) from None

            for row, take in consumed:
                StockMovement.objects.create(
                    part_number=allocation.material_code,
                    quantity=take,
                    warehouse=allocation.warehouse,
                    location=row.location,
                    movement_type=StockMovement.MovementType.USED,
                    movement_date=now,
                    reference_document=f"MaterialAllocation-{allocation.id}",
                    description=f"Issued for allocation {allocation.id}.",
                    operator=operator,
                )
            SalesOrder.objects.filter(order_number=so_order_number).update(
                status=SalesOrder.Status.SHIPPED, shipped_quantity=allocation.allocated_quantity
            )

        elif new_status == MaterialAllocation.Status.RETURNED:
            row = add_stock(allocation.material_code, allocation.warehouse, allocation.allocated_quantity)

            StockMovement.objects.create(
                part_number=allocation.material_code,
                quantity=allocation.allocated_quantity,
                warehouse=allocation.warehouse,
                location=row.location,
                movement_type=StockMovement.MovementType.INCOMING,
                movement_date=now,
                reference_document=f"MaterialAllocation-{allocation.id}",
                description=f"Returned unused from allocation {allocation.id}.",
                operator=operator,
            )
            SalesOrder.objects.filter(order_number=so_order_number).update(status=SalesOrder.Status.CANCELED)

        allocation.status = new_status
        allocation.save()

    return allocation
