import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from base.feature_settings import apply_terms
from inventory.models import SalesOrder, StockMovement
from inventory.services import (
    InventoryServiceError,
    add_stock,
    consume_stock,
    get_or_create_locked_inventory,
    item_default_location_for,
    lock_inventory_rows,
)
from master.models import Warehouse

from ..models import MaterialAllocation, ProductionPlan, WorkProgress
from .allocation import build_internal_so_order_number
from .merge import apportion_completion, release_merged_plans, reverse_apportion

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
    if new_status == ProductionPlan.Status.MERGED:
        raise ValueError("統合済みには変更できません。生産計画を統合する操作で行ってください。")

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
        if plan.status == ProductionPlan.Status.MERGED:
            raise ValueError("統合済みの生産計画の進捗は更新できません。統合先の生産計画で更新してください。")
        # 部品を引き当てたままの統合計画を中止すると、元の計画だけ未着手に戻り、引当(在庫の確保)が中止した計画に残り続ける
        if (
            new_status == ProductionPlan.Status.CANCELLED
            and plan.status != ProductionPlan.Status.CANCELLED
            and plan.merged_plans.exists()
            and plan.material_allocations.filter(status=MaterialAllocation.Status.ALLOCATED).exists()
        ):
            raise ValueError(apply_terms("部品の引当がある統合計画は中止できません。先に引当を解除してください。"))
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
            # 次に完了したときは、改めて完成品の入庫倉庫・棚番を指定する
            plan.finished_goods_warehouse = None
            plan.finished_goods_location = None
            work_progress.quantity_completed = 0
            work_progress.actual_reported_quantity = None
            work_progress.defective_reported_quantity = None

        # 初めて完了になった場合に、完成品の入庫倉庫・棚番を決めて記録する。
        # 統合計画の按分(apportion_completion)で元計画にも写すため、保存前に行う。
        # (完了数量が0でも記録し、後から完了数量を増やした場合も同じ倉庫・棚番へ計上する)
        if new_status == ProductionPlan.Status.COMPLETED:
            if old_plan_status != ProductionPlan.Status.COMPLETED:
                plan.finished_goods_warehouse, plan.finished_goods_location = _resolve_finished_goods_destination(
                    plan, data
                )
            else:
                _reject_destination_change(plan, data)

        plan.save()
        work_progress.save()

        # 統合計画の場合は、元の計画へ完了数量を按分する / 完了の取消・中止で元の計画を戻す
        if plan.merged_plans.exists():
            if new_status == ProductionPlan.Status.COMPLETED:
                apportion_completion(plan, work_progress.quantity_completed)
            elif old_plan_status == ProductionPlan.Status.COMPLETED:
                reverse_apportion(plan)
            if new_status == ProductionPlan.Status.CANCELLED:
                release_merged_plans(plan)

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


def default_finished_goods_destination(plan):
    """
    完了報告の入庫倉庫・棚番の初期値。品番マスタのデフォルト入庫倉庫(無ければ既定の完成品倉庫)と、
    その倉庫で使える品番マスタのデフォルト入庫棚番(無ければ "")。
    """
    item = plan.product
    warehouse = (item.default_warehouse if item else None) or DEFAULT_FINISHED_GOODS_WAREHOUSE
    return warehouse, item_default_location_for(item, warehouse)


def _resolve_finished_goods_destination(plan, data):
    """
    初めて完了したときの完成品の入庫倉庫・棚番。完了報告で指定されていればそれを、無ければ初期値を使う。
    倉庫だけ指定された場合の棚番は、その倉庫で使える品番マスタのデフォルト入庫棚番(無ければ棚番なし)。
    """
    warehouse = (data.get("warehouse") or "").strip()
    if warehouse:
        default_location = item_default_location_for(plan.product, warehouse)
    else:
        warehouse, default_location = default_finished_goods_destination(plan)
    location = data.get("location")
    location = (location or "").strip() if location is not None else default_location
    if not Warehouse.objects.filter(warehouse_number=warehouse).exists():
        raise ValueError(f"完成品の入庫倉庫 '{warehouse}' が存在しません。")
    return warehouse, location


def _reject_destination_change(plan, data):
    """完了後の完了数量の変更では、入庫倉庫・棚番を変えられない(取消時に計上した倉庫から減らすため)。"""
    warehouse = (data.get("warehouse") or "").strip()
    if warehouse and warehouse != _finished_goods_warehouse(plan):
        raise ValueError(
            "完了済みの生産計画の入庫倉庫は変更できません。変更する場合は、いったん完了を取り消してから完了し直してください。"
        )


def _finished_goods_warehouse(plan):
    """完成品を計上した倉庫。記録を始める前に完了した計画は、当時の計上先である既定の完成品倉庫。"""
    return plan.finished_goods_warehouse or DEFAULT_FINISHED_GOODS_WAREHOUSE


def _remove_finished_goods(plan, quantity, now, user, reference_document, description):
    """完成品の計上倉庫から完成品を減らす(完了の取消・完了数量の減少)。他の受注が引き当てている分は減らせない。"""
    product_code = plan.product_code
    warehouse = _finished_goods_warehouse(plan)
    rows = [row for row in lock_inventory_rows(product_code, warehouse) if row.is_active]
    if not rows:
        raise ValueError(f"Inventory for product {product_code} not found for reversal.")
    # 完了時に計上した棚から先に減らす(他の棚の古い在庫を減らして、計上した棚に実在しない在庫が残らないように)
    if plan.finished_goods_warehouse:
        recorded_location = plan.finished_goods_location or ""
        rows.sort(key=lambda row: row.location != recorded_location)
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
    target_warehouse = _finished_goods_warehouse(plan)
    description = f"Plan {plan.id} completion. Qty changed by: {adjustment}. New total: {total_completed}."

    if adjustment < 0:
        _remove_finished_goods(
            plan, abs(adjustment), now, user, reference_document=f"ProductionPlan-{plan.id}", description=description
        )
        return

    # 記録した棚番があればその棚へ、無ければ(棚番なしを指定した場合・記録を始める前に完了した計画)
    # 棚番なし(または既存の棚)へ計上する
    location = plan.finished_goods_location if plan.finished_goods_warehouse else ""
    if location:
        row = get_or_create_locked_inventory(product_code, target_warehouse, location)
        row.quantity += adjustment
        row.save()
    else:
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

        rows = [
            row for row in lock_inventory_rows(alloc.material_code, alloc.warehouse, alloc.purpose) if row.is_active
        ]
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
                purpose=row.purpose,
                line=alloc.line,
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
    # 追加出庫は実際に使われた分のため戻さない
    allocations = MaterialAllocation.objects.filter(
        production_plan=plan,
        status=MaterialAllocation.Status.ISSUED,
        allocation_type=MaterialAllocation.AllocationType.NORMAL,
    ).select_for_update()

    for alloc in allocations:
        if not alloc.warehouse:
            continue

        # 在庫と引当を戻す
        quantity_to_restore = alloc.allocated_quantity
        row = add_stock(
            alloc.material_code, alloc.warehouse, quantity_to_restore, reserved=quantity_to_restore, purpose=alloc.purpose
        )

        alloc.status = MaterialAllocation.Status.ALLOCATED
        alloc.save()

        StockMovement.objects.create(
            part_number=alloc.material_code,
            quantity=quantity_to_restore,
            warehouse=alloc.warehouse,
            location=row.location,
            purpose=row.purpose,
            line=alloc.line,
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
