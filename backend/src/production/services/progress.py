from django.db import transaction
from django.utils import timezone
import logging

from inventory.models import Inventory, SalesOrder, StockMovement
from ..models import MaterialAllocation, ProductionPlan, WorkProgress

logger = logging.getLogger(__name__)

DEFAULT_FINISHED_GOODS_WAREHOUSE = "FG-MAIN"

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
                "operator": user if user and user.is_authenticated else None,
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

        # COMPLETEDから別のステータスに戻る場合の在庫逆仕訳（完成品を減らし、材料を引き当て状態に戻す）
        if old_plan_status == ProductionPlan.Status.COMPLETED and new_status != ProductionPlan.Status.COMPLETED:
            if previous_wp_completed_quantity > 0:
                _reverse_inventory(plan, previous_wp_completed_quantity, now, user)
                _restore_materials_for_plan(plan, now, user)
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
            
            # 初めて完了になった場合に部材を消費
            if old_plan_status != ProductionPlan.Status.COMPLETED:
                _consume_materials_for_plan(plan, now, user)

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
            operator=user if user and user.is_authenticated else None,
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
        operator=user if user and user.is_authenticated else None,
    )


def _consume_materials_for_plan(plan, now, user):
    """
    生産計画に関連付けられた材料を消費（出庫）処理します。
    在庫の quantity と reserved を両方減らします。
    """
    allocations = MaterialAllocation.objects.filter(production_plan=plan, status="ALLOCATED").select_for_update()

    for alloc in allocations:
        if not alloc.warehouse:
            continue

        try:
            inventory_item = Inventory.objects.select_for_update().get(
                part_number=alloc.material_code, warehouse=alloc.warehouse
            )

            # 在庫と引当の減少
            quantity_to_consume = alloc.allocated_quantity
            inventory_item.quantity -= quantity_to_consume
            inventory_item.reserved -= quantity_to_consume
            inventory_item.save()

            # ステータス更新
            alloc.status = "ISSUED"
            alloc.save()

            # 在庫移動履歴の作成
            StockMovement.objects.create(
                part_number=alloc.material_code,
                quantity=quantity_to_consume,
                warehouse=alloc.warehouse,
                movement_type="used",
                movement_date=now,
                reference_document=f"ProductionPlan-{plan.id}",
                description=f"Consumed for plan {plan.id} completion.",
                operator=user if user and user.is_authenticated else None,
            )

            # 関連する SalesOrder があれば完了（shipped）にする
            so_order_number_prefix = f"INT-{alloc.id.hex[:15]}"
            SalesOrder.objects.filter(order_number__startswith=so_order_number_prefix).update(
                status="shipped", shipped_quantity=quantity_to_consume
            )

        except Inventory.DoesNotExist:
            logger.error(f"Inventory not found for consumption: {alloc.material_code} in {alloc.warehouse}")


def _restore_materials_for_plan(plan, now, user):
    """
    生産完了が取り消された際、消費された材料を引き当て状態（ALLOCATED）に戻します。
    """
    allocations = MaterialAllocation.objects.filter(production_plan=plan, status="ISSUED").select_for_update()

    for alloc in allocations:
        if not alloc.warehouse:
            continue

        inventory_item, created = Inventory.objects.select_for_update().get_or_create(
            part_number=alloc.material_code,
            warehouse=alloc.warehouse,
            defaults={"quantity": 0, "reserved": 0, "is_active": True, "is_allocatable": True},
        )

        # 在庫と引当を戻す
        quantity_to_restore = alloc.allocated_quantity
        inventory_item.quantity += quantity_to_restore
        inventory_item.reserved += quantity_to_restore
        inventory_item.save()

        # ステータス戻し
        alloc.status = "ALLOCATED"
        alloc.save()

        # 在庫移動履歴（取消）の作成
        StockMovement.objects.create(
            part_number=alloc.material_code,
            quantity=quantity_to_restore,
            warehouse=alloc.warehouse,
            movement_type="incoming",
            movement_date=now,
            reference_document=f"Reversal for PPlan-{plan.id}",
            description=f"Restored from plan {plan.id} reversal.",
            operator=user if user and user.is_authenticated else None,
        )

        # 関連する SalesOrder を pending に戻す
        so_order_number_prefix = f"INT-{alloc.id.hex[:15]}"
        SalesOrder.objects.filter(order_number__startswith=so_order_number_prefix).update(
            status="pending", shipped_quantity=0
        )
