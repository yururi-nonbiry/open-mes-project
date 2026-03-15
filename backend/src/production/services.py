from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from inventory.models import Inventory, SalesOrder, StockMovement

from .models import MaterialAllocation, WorkProgress

DEFAULT_FINISHED_GOODS_WAREHOUSE = "FG-MAIN"


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


def update_production_progress_service(plan, data, user):
    """
    生産計画の進捗を更新するサービス。
    ステータスに応じた計画の更新、WorkProgressの作成・更新、在庫の増減を行います。
    """
    new_status = data.get("status")
    if not new_status:
        raise ValueError("New status is required.")

    now = timezone.now()
    PROCESS_STEP_OVERALL = "Overall Plan Progress"

    with transaction.atomic():
        work_progress, wp_created = WorkProgress.objects.select_for_update().get_or_create(
            production_plan=plan,
            process_step=PROCESS_STEP_OVERALL,
            defaults={
                "operator": user if user.is_authenticated else None,
                "status": "NOT_STARTED",
            },
        )
        previous_wp_completed_quantity = work_progress.quantity_completed
        old_plan_status = plan.status
        plan.status = new_status

        # ステータスに応じたロジック
        if new_status == "IN_PROGRESS":
            if old_plan_status in ["PENDING", "ON_HOLD"]:
                if not plan.actual_start_datetime:
                    plan.actual_start_datetime = now
            work_progress.status = "IN_PROGRESS"
            if not work_progress.start_datetime:
                work_progress.start_datetime = now
            work_progress.end_datetime = None

        elif new_status == "COMPLETED":
            if not plan.actual_start_datetime:
                plan.actual_start_datetime = now
            plan.actual_end_datetime = now
            work_progress.status = "COMPLETED"
            if not work_progress.start_datetime:
                work_progress.start_datetime = now
            work_progress.end_datetime = now

            # 数量のバリデーションと設定
            good_quantity_str = data.get("good_quantity")
            if good_quantity_str is None:
                raise ValueError("good_quantity is required when status is 'COMPLETED'.")
            try:
                good_val = int(good_quantity_str)
                if good_val < 0:
                    raise ValueError("good_quantity must be non-negative.")
                work_progress.quantity_completed = good_val
            except (ValueError, TypeError):
                raise ValueError("Invalid value for good_quantity.")

            actual_quantity_str = data.get("actual_quantity")
            if actual_quantity_str is not None:
                try:
                    actual_val = int(actual_quantity_str)
                    if actual_val < 0:
                        raise ValueError("actual_quantity must be non-negative.")
                    work_progress.actual_reported_quantity = actual_val
                except (ValueError, TypeError):
                    raise ValueError("Invalid value for actual_quantity.")
            else:
                work_progress.actual_reported_quantity = None

            defective_quantity_str = data.get("defective_quantity")
            if defective_quantity_str is not None:
                try:
                    defective_val = int(defective_quantity_str)
                    if defective_val < 0:
                        raise ValueError("defective_quantity must be non-negative.")
                    work_progress.defective_reported_quantity = defective_val
                except (ValueError, TypeError):
                    raise ValueError("Invalid value for defective_quantity.")
            else:
                work_progress.defective_reported_quantity = None

        elif new_status == "ON_HOLD":
            work_progress.status = "PAUSED"

        elif new_status == "CANCELLED":
            if plan.actual_start_datetime and not plan.actual_end_datetime:
                plan.actual_end_datetime = now
            if work_progress.status in ["IN_PROGRESS", "NOT_STARTED"]:
                work_progress.status = "PAUSED"
                if work_progress.start_datetime and not work_progress.end_datetime:
                    work_progress.end_datetime = now

        elif new_status == "PENDING":
            work_progress.status = "NOT_STARTED"

        # COMPLETEDから別のステータスに戻る場合の在庫逆仕訳
        if old_plan_status == "COMPLETED" and new_status != "COMPLETED":
            if previous_wp_completed_quantity > 0:
                _reverse_inventory(plan, previous_wp_completed_quantity, now, user)
                work_progress.quantity_completed = 0
                work_progress.actual_reported_quantity = None
                work_progress.defective_reported_quantity = None

        plan.save()
        work_progress.save()

        # COMPLETEDになった（または完了数量が更新された）場合の在庫調整
        if new_status == "COMPLETED":
            newly_reported_completed_quantity = work_progress.quantity_completed
            adjustment = newly_reported_completed_quantity
            if old_plan_status == "COMPLETED":
                adjustment = newly_reported_completed_quantity - previous_wp_completed_quantity
            
            if adjustment != 0:
                _adjust_inventory_for_completion(plan, adjustment, newly_reported_completed_quantity, now, user)

    return plan, work_progress


def _reverse_inventory(plan, quantity, now, user):
    product_code = plan.product_code
    warehouse = DEFAULT_FINISHED_GOODS_WAREHOUSE
    try:
        inventory_item = Inventory.objects.select_for_update().get(part_number=product_code, warehouse=warehouse)
        if inventory_item.quantity < quantity:
            raise ValueError(f"Cannot reverse production: insufficient stock for {product_code}.")
        inventory_item.quantity -= quantity
        inventory_item.save()

        StockMovement.objects.create(
            part_number=product_code,
            quantity=quantity,
            warehouse=warehouse,
            movement_type="PRODUCTION_REVERSAL",
            movement_date=now,
            reference_document=f"Reversal for PPlan-{plan.id}",
            description=f"Prod. completion reversed for plan {plan.id}.",
            operator=user if user.is_authenticated else None,
        )
    except Inventory.DoesNotExist:
        raise ValueError(f"Inventory for product {product_code} not found for reversal.")


def _adjust_inventory_for_completion(plan, adjustment, total_completed, now, user):
    product_code = plan.product_code
    target_warehouse = DEFAULT_FINISHED_GOODS_WAREHOUSE
    inventory_item, created = Inventory.objects.select_for_update().get_or_create(
        part_number=product_code,
        warehouse=target_warehouse,
        defaults={"quantity": 0, "reserved": 0, "is_active": True, "is_allocatable": True},
    )

    if adjustment < 0 and inventory_item.quantity < abs(adjustment):
        raise ValueError(f"Cannot reduce completed quantity: insufficient stock for {product_code}.")

    inventory_item.quantity += adjustment
    inventory_item.save()

    StockMovement.objects.create(
        part_number=product_code,
        quantity=abs(adjustment),
        warehouse=target_warehouse,
        movement_type="PRODUCTION_OUTPUT" if adjustment > 0 else "PRODUCTION_REVERSAL",
        movement_date=now,
        reference_document=f"ProductionPlan-{plan.id}",
        description=f"Plan {plan.id} completion. Qty changed by: {adjustment}. New total: {total_completed}.",
        operator=user if user.is_authenticated else None,
    )
