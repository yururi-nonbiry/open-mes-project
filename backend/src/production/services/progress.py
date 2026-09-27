import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from inventory.models import SalesOrder, StockMovement
from inventory.services import InventoryServiceError, add_stock, consume_stock, lock_inventory_rows

from ..models import MaterialAllocation, ProductionPlan, WorkProgress
from .allocation import build_internal_so_order_number

logger = logging.getLogger(__name__)

DEFAULT_FINISHED_GOODS_WAREHOUSE = settings.DEFAULT_FINISHED_GOODS_WAREHOUSE

def update_production_progress_service(plan, data, user):
    """
    生産計画の進捗を更新するサービス。
    ステータスに応じた計画の更新、WorkProgressの作成・更新、在庫の増減を行います。
    """
    new_status = data.get("status")
    if not new_status:
        raise ValueError("New status is required.")
    if new_status not in ProductionPlan.Status.values:
        raise ValueError(f"Invalid status: {new_status}")

    now = timezone.now()
    PROCESS_STEP_OVERALL = "Overall Plan Progress"

    with transaction.atomic():
        # 行ロックを取得した上で最新の状態を再取得する。ロックせずに旧ステータスを判定すると、
        # 完了報告の二重送信時に両リクエストが「初回完了」と判定し完成品を二重計上してしまう。
        plan = ProductionPlan.objects.select_for_update().get(pk=plan.pk)
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
        # 材料消費は完了時の良品数量に関わらず（0件でも）常に行われるため、
        # 復元処理も quantity_completed の値に関係なく必ず実行する。
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
        raise ValueError("Invalid value for good_quantity.") from None

    actual_quantity_str = data.get("actual_quantity")
    if actual_quantity_str is not None:
        try:
            actual_val = int(actual_quantity_str)
            if actual_val < 0:
                raise ValueError("actual_quantity must be non-negative.")
            work_progress.actual_reported_quantity = actual_val
        except (ValueError, TypeError):
            raise ValueError("Invalid value for actual_quantity.") from None
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
            raise ValueError("Invalid value for defective_quantity.") from None
    else:
        work_progress.defective_reported_quantity = None

    # 良品数と不良品数の合計が実績報告数量を超えないことを検証する
    # (良品数は完成品在庫への計上に直結するため、フロント側の検証だけに頼らずサーバー側でも必須とする)
    if work_progress.actual_reported_quantity is not None:
        defective_for_check = work_progress.defective_reported_quantity or 0
        if work_progress.quantity_completed + defective_for_check > work_progress.actual_reported_quantity:
            raise ValueError(
                "good_quantity と defective_quantity の合計が actual_quantity を超えています。"
            )


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


def _remove_finished_goods(plan, quantity, now, user, reference_document, description):
    """完成品倉庫から完成品を減らす(完了の取消・完了数量の減少)。他の受注が引き当てている分は減らせない。"""
    product_code = plan.product_code
    warehouse = DEFAULT_FINISHED_GOODS_WAREHOUSE
    rows = [row for row in lock_inventory_rows(product_code, warehouse) if row.is_active]
    if not rows:
        raise ValueError(f"Inventory for product {product_code} not found for reversal.")
    try:
        consumed, _ = consume_stock(rows, quantity)
    except InventoryServiceError as e:
        raise ValueError(f"Cannot reverse production: insufficient stock for {product_code}. {e.message}") from None

    for row, take in consumed:
        StockMovement.objects.create(
            part_number=product_code,
            quantity=take,
            warehouse=warehouse,
            location=row.location,
            movement_type=StockMovement.MovementType.PRODUCTION_REVERSAL,
            movement_date=now,
            reference_document=reference_document,
            description=description,
            operator=_operator_or_none(user),
        )


def _reverse_inventory(plan, quantity, now, user):
    _remove_finished_goods(
        plan,
        quantity,
        now,
        user,
        reference_document=f"Reversal for PPlan-{plan.id}",
        description=f"Prod. completion reversed for plan {plan.id}.",
    )


def _adjust_inventory_for_completion(plan, adjustment, total_completed, now, user):
    product_code = plan.product_code
    target_warehouse = DEFAULT_FINISHED_GOODS_WAREHOUSE
    description = f"Plan {plan.id} completion. Qty changed by: {adjustment}. New total: {total_completed}."

    if adjustment < 0:
        _remove_finished_goods(
            plan, abs(adjustment), now, user, reference_document=f"ProductionPlan-{plan.id}", description=description
        )
        return

    row = add_stock(product_code, target_warehouse, adjustment)
    StockMovement.objects.create(
        part_number=product_code,
        quantity=adjustment,
        warehouse=target_warehouse,
        location=row.location,
        movement_type=StockMovement.MovementType.PRODUCTION_OUTPUT,
        movement_date=now,
        reference_document=f"ProductionPlan-{plan.id}",
        description=description,
        operator=_operator_or_none(user),
    )


def _consume_materials_for_plan(plan, now, user):
    """
    生産計画に関連付けられた材料を消費（出庫）処理します。
    在庫の quantity と、その材料引当自身の reserved を減らします。
    """
    allocations = MaterialAllocation.objects.filter(
        production_plan=plan, status=MaterialAllocation.Status.ALLOCATED
    ).select_for_update()

    for alloc in allocations:
        if not alloc.warehouse:
            continue

        rows = [row for row in lock_inventory_rows(alloc.material_code, alloc.warehouse) if row.is_active]
        if not rows:
            logger.error(f"Inventory not found for consumption: {alloc.material_code} in {alloc.warehouse}")
            continue

        quantity_to_consume = alloc.allocated_quantity
        try:
            consumed, _ = consume_stock(rows, quantity_to_consume, own_reserved=quantity_to_consume)
        except InventoryServiceError as e:
            raise ValueError(
                f"Cannot consume materials for plan {plan.id}: insufficient stock for "
                f"'{alloc.material_code}' in '{alloc.warehouse}'. {e.message}"
            ) from None

        alloc.status = MaterialAllocation.Status.ISSUED
        alloc.save()

        for row, take in consumed:
            StockMovement.objects.create(
                part_number=alloc.material_code,
                quantity=take,
                warehouse=alloc.warehouse,
                location=row.location,
                movement_type=StockMovement.MovementType.USED,
                movement_date=now,
                reference_document=f"ProductionPlan-{plan.id}",
                description=f"Consumed for plan {plan.id} completion.",
                operator=_operator_or_none(user),
            )

        # 関連する内部受注を完了（shipped）にする
        SalesOrder.objects.filter(order_number=build_internal_so_order_number(alloc.id)).update(
            status=SalesOrder.Status.SHIPPED, shipped_quantity=quantity_to_consume
        )


def _restore_materials_for_plan(plan, now, user):
    """
    生産完了が取り消された際、消費された材料を引き当て状態（ALLOCATED）に戻します。
    """
    allocations = MaterialAllocation.objects.filter(
        production_plan=plan, status=MaterialAllocation.Status.ISSUED
    ).select_for_update()

    for alloc in allocations:
        if not alloc.warehouse:
            continue

        # 在庫と引当を戻す
        quantity_to_restore = alloc.allocated_quantity
        row = add_stock(alloc.material_code, alloc.warehouse, quantity_to_restore, reserved=quantity_to_restore)

        alloc.status = MaterialAllocation.Status.ALLOCATED
        alloc.save()

        StockMovement.objects.create(
            part_number=alloc.material_code,
            quantity=quantity_to_restore,
            warehouse=alloc.warehouse,
            location=row.location,
            movement_type=StockMovement.MovementType.INCOMING,
            movement_date=now,
            reference_document=f"Reversal for PPlan-{plan.id}",
            description=f"Restored from plan {plan.id} reversal.",
            operator=_operator_or_none(user),
        )

        # 関連する内部受注を pending に戻す
        SalesOrder.objects.filter(order_number=build_internal_so_order_number(alloc.id)).update(
            status=SalesOrder.Status.PENDING, shipped_quantity=0
        )


def _operator_or_none(user):
    return user if user and user.is_authenticated else None
