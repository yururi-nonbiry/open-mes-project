from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from inventory.models import Inventory, SalesOrder, StockMovement

from .models import MaterialAllocation, PartsUsed, ProductionPlan, WorkProgress

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
        work_progress, _ = WorkProgress.objects.select_for_update().get_or_create(
            production_plan=plan,
            process_step=PROCESS_STEP_OVERALL,
            defaults={
                "operator": user if user.is_authenticated else None,
                "status": WorkProgress.Status.NOT_STARTED,
            },
        )
        previous_wp_completed_quantity = work_progress.quantity_completed
        old_plan_status = plan.status
        plan.status = new_status

        # ステータスに応じたロジックをハンドラに委譲
        if new_status == ProductionPlan.Status.IN_PROGRESS:
            _handle_in_progress_status(plan, work_progress, old_plan_status, now)
        elif new_status == ProductionPlan.Status.COMPLETED:
            _handle_completed_status(plan, work_progress, data, now)
        elif new_status == ProductionPlan.Status.ON_HOLD:
            _handle_on_hold_status(work_progress)
        elif new_status == ProductionPlan.Status.CANCELLED:
            _handle_cancelled_status(plan, work_progress, now)
        elif new_status == ProductionPlan.Status.PENDING:
            _handle_pending_status(work_progress)

        # COMPLETEDから別のステータスに戻る場合の在庫逆仕訳
        if old_plan_status == ProductionPlan.Status.COMPLETED and new_status != ProductionPlan.Status.COMPLETED:
            if previous_wp_completed_quantity > 0:
                _reverse_inventory(plan, previous_wp_completed_quantity, now, user)
                work_progress.quantity_completed = 0
                work_progress.actual_reported_quantity = None
                work_progress.defective_reported_quantity = None

        plan.save()
        work_progress.save()

        # COMPLETEDになった（または完了数量が更新された）場合の在庫調整
        if new_status == ProductionPlan.Status.COMPLETED:
            newly_reported_completed_quantity = work_progress.quantity_completed
            adjustment = newly_reported_completed_quantity
            if old_plan_status == ProductionPlan.Status.COMPLETED:
                adjustment = newly_reported_completed_quantity - previous_wp_completed_quantity
            
            if adjustment != 0:
                _adjust_inventory_for_completion(plan, adjustment, newly_reported_completed_quantity, now, user)

    return plan, work_progress


def _handle_in_progress_status(plan, work_progress, old_plan_status, now):
    if old_plan_status in [ProductionPlan.Status.PENDING, ProductionPlan.Status.ON_HOLD]:
        if not plan.actual_start_datetime:
            plan.actual_start_datetime = now
    work_progress.status = WorkProgress.Status.IN_PROGRESS
    if not work_progress.start_datetime:
        work_progress.start_datetime = now
    work_progress.end_datetime = None


def _handle_completed_status(plan, work_progress, data, now):
    if not plan.actual_start_datetime:
        plan.actual_start_datetime = now
    plan.actual_end_datetime = now
    work_progress.status = WorkProgress.Status.COMPLETED
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


def _handle_on_hold_status(work_progress):
    work_progress.status = WorkProgress.Status.PAUSED


def _handle_cancelled_status(plan, work_progress, now):
    if plan.actual_start_datetime and not plan.actual_end_datetime:
        plan.actual_end_datetime = now
    if work_progress.status in [WorkProgress.Status.IN_PROGRESS, WorkProgress.Status.NOT_STARTED]:
        work_progress.status = WorkProgress.Status.PAUSED
        if work_progress.start_datetime and not work_progress.end_datetime:
            work_progress.end_datetime = now


def _handle_pending_status(work_progress):
    work_progress.status = WorkProgress.Status.NOT_STARTED


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


def get_production_plan_required_parts(production_plan_instance):
    """
    特定の生産計画に必要な部品リストとその現在の在庫・引当状況を返します。
    クエリを最適化し、N+1問題を回避しています。
    """
    plan_identifier = production_plan_instance.production_plan
    if not plan_identifier:
        return []

    # 1. 使用部品情報を一括取得
    parts_used_queryset = PartsUsed.objects.filter(production_plan=plan_identifier)
    if not parts_used_queryset.exists():
        return []

    part_codes = list(parts_used_queryset.values_list("part_code", flat=True).distinct())

    # 2. 在庫情報を一括取得
    inventory_items = Inventory.objects.filter(part_number__in=part_codes, is_active=True, is_allocatable=True)

    # 在庫データをマッピング (part_code -> {warehouse -> quantity}) または (part_code -> total_quantity)
    inventory_map = {}
    for inv in inventory_items:
        if inv.part_number not in inventory_map:
            inventory_map[inv.part_number] = {}
        inventory_map[inv.part_number][inv.warehouse] = inventory_map[inv.part_number].get(inv.warehouse, 0) + (
            inv.available_quantity or 0
        )

    # 3. 引当済情報を一括取得
    allocations = (
        MaterialAllocation.objects.filter(production_plan=production_plan_instance, material_code__in=part_codes)
        .values("material_code")
        .annotate(total_allocated=Sum("allocated_quantity"))
    )
    allocation_map = {a["material_code"]: a["total_allocated"] for a in allocations}

    # 4. 結果の組み立て
    results = []
    for part_used in parts_used_queryset:
        part_code = part_used.part_code
        target_warehouse = part_used.warehouse

        # 在庫数量の計算
        if target_warehouse:
            # 特定の倉庫が指定されている場合
            current_inventory_quantity = inventory_map.get(part_code, {}).get(target_warehouse, 0)
        else:
            # 倉庫指定がない場合、全倉庫の合計
            current_inventory_quantity = sum(inventory_map.get(part_code, {}).values())

        results.append(
            {
                "part_code": part_code,
                "part_name": f"{part_code} (名称は別途マスタ参照)",  # TODO: マスタ連携
                "required_quantity": part_used.quantity_used,
                "unit": "個",
                "inventory_quantity": current_inventory_quantity,
                "warehouse": target_warehouse,
                "already_allocated_quantity": allocation_map.get(part_code, 0),
            }
        )

    return results
