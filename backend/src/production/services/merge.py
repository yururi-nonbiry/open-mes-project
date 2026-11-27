"""
同一品番の生産計画を1つの統合計画にまとめる(引当・ピッキング・生産を一括で行うため)。

- 統合計画は普通の生産計画として作る(数量は合計、所要部品は合算、納期は元計画で最も早いもの)。
  元の計画は「統合済」にして統合計画に紐づけ、以降の引当・生産は統合計画で行う。
- 統合計画の生産が完了したら、完了数量(良品数)を元計画に納期順で割り振る(按分)。
"""

from decimal import ROUND_CEILING, Decimal

from django.db import transaction

from base.feature_settings import apply_terms

from ..models import MaterialAllocation, ProductionPlan, ProductionPlanMaterial, WorkProgress
from .intermediates import (
    OPEN_STATUSES,
    SupplyMethod,
    auto_arrange_intermediates,
    cancel_child_plans,
    material_required_quantities,
    trim_child_plans,
)

OVERALL_PROCESS_STEP = WorkProgress.OVERALL_PROCESS_STEP


def _order_key(plan):
    return (plan.planned_end_datetime, plan.planned_start_datetime, plan.created_at)


def _child_plan_blocker(plan):
    """
    子計画(中間品の計画)が統合の妨げになる理由を返す(妨げにならなければ None)。
    未着手で引当のない子計画は、統合時に中止して統合計画で作り直せる。着手済み・保留・引当済みの子計画がある場合は統合できない。
    完了・中止した子計画は影響しない(完了した分は在庫として使われる)。
    """
    for child in plan.child_plans.all():
        if child.status in (ProductionPlan.Status.COMPLETED, ProductionPlan.Status.CANCELLED):
            continue
        if child.status != ProductionPlan.Status.PENDING:
            return f"子計画「{child.plan_name}」が着手済み・保留のため統合できません。"
        if MaterialAllocation.objects.filter(production_plan=child).exclude(
            status=MaterialAllocation.Status.RETURNED
        ).exists():
            return apply_terms(f"子計画「{child.plan_name}」に部品の引当があるため統合できません。先に引当を解除してください。")
        reason = _child_plan_blocker(child)
        if reason:
            return reason
    return None


def merge_blocker(plan):
    """統合の対象にできない理由を返す(対象にできるなら None)。"""
    if plan.status != ProductionPlan.Status.PENDING:
        return "未着手の計画だけ統合できます。"
    if plan.merged_into_id or plan.merged_plans.exists():
        return "すでに統合されています。"
    if plan.parent_plan_id:
        return "中間品の子計画は統合できません。"
    reason = _child_plan_blocker(plan)
    if reason:
        return reason
    if MaterialAllocation.objects.filter(production_plan=plan).exists():
        return apply_terms("部品の引当がある計画は統合できません。先に引当を解除してください。")
    return None


def _group_key(plan):
    # 用途が違うと使う在庫が変わるため、同じ品番でも用途が違う計画は別グループにする
    return (plan.product_id, plan.purpose or "")


def find_merge_groups(plans):
    """統合できる計画を品番(+用途)ごとにまとめ、2件以上のグループだけを返す(グループ内は納期順)。"""
    groups = {}
    for plan in plans:
        if plan.product_id and merge_blocker(plan) is None:
            groups.setdefault(_group_key(plan), []).append(plan)
    result = [sorted(g, key=_order_key) for g in groups.values() if len(g) >= 2]
    return sorted(result, key=lambda g: _order_key(g[0]))


def _quantity_per_unit(required, total):
    """
    合算した所要量から1個あたり所要数量(小数3桁)を求める。所要量は合計をそのまま使うため参考値だが、
    切り捨て・四捨五入で0になると所要量の再計算で部品が0個になるため、切り上げる。
    """
    if not total:
        return Decimal(0)
    return (Decimal(required) / Decimal(total)).quantize(Decimal("0.001"), rounding=ROUND_CEILING)


def _common(values):
    values = set(values)
    return values.pop() if len(values) == 1 else None


@transaction.atomic
def merge_plans(plans):
    """計画を統合計画にまとめ、作成した統合計画を返す。"""
    ids = [p.pk for p in plans]
    if len(ids) < 2 or len(set(ids)) != len(ids):
        raise ValueError("統合には、異なる生産計画を2件以上指定してください。")
    plans = sorted(ProductionPlan.objects.select_for_update().filter(pk__in=ids), key=_order_key)
    if len(plans) != len(ids):
        raise ValueError("生産計画の指定が不正です。")
    for plan in plans:
        reason = merge_blocker(plan)
        if reason:
            raise ValueError(f"「{plan.plan_name}」: {reason}")
    if len({_group_key(p) for p in plans}) != 1:
        raise ValueError("品番と用途が同じ計画だけを統合できます。")

    # 子計画(中間品の計画)は、元の計画ごとのものを中止し、統合計画で合算した数量から作り直す
    for plan in plans:
        cancel_child_plans(plan)

    first = plans[0]
    total = sum(p.planned_quantity for p in plans)
    merged = ProductionPlan.objects.create(
        plan_name=f"統合 {first.product_id} ({len(plans)}件)",
        product_code=first.product_id,
        purpose=first.purpose,
        line=_common(p.line for p in plans),
        planned_quantity=total,
        planned_start_datetime=min(p.planned_start_datetime for p in plans),
        planned_end_datetime=min(p.planned_end_datetime for p in plans),  # 納期は最も早いもの
        status=ProductionPlan.Status.PENDING,
        remarks="統合元: " + "、".join(p.plan_name for p in plans),
    )

    # 所要部品は部品ごとに合算する(所要量は元計画の所要量の合計をそのまま使う)。
    # 計画の作成時にBOMマスターからコピーされた所要部品(保存シグナル)は、元計画の編集内容を反映するため作り直す。
    previous_required = material_required_quantities(merged)
    merged.materials.all().delete()
    by_material = {}
    for plan in plans:
        for m in plan.materials.all():
            by_material.setdefault(m.material_id, []).append(m)
    for material_id, rows in by_material.items():
        required = sum(m.required_quantity for m in rows)
        ProductionPlanMaterial.objects.create(
            production_plan=merged,
            material_id=material_id,
            quantity_per_unit=_quantity_per_unit(required, total),
            required_quantity=required,
            # 子計画で賄う設定は、統合計画で子計画を作り直すときに設定される
            supply_method=(
                lambda method: ProductionPlanMaterial.SupplyMethod.UNDECIDED
                if method in (None, SupplyMethod.CHILD_PLAN)
                else method
            )(_common(m.supply_method for m in rows)),
        )

    trim_child_plans(merged, previous_required)
    auto_arrange_intermediates(merged)
    # 統合計画の作成時に自動で作られた子計画がある中間品は、子計画で賄う設定にする
    for code in merged.child_plans.filter(status__in=OPEN_STATUSES).values_list("product_id", flat=True):
        merged.materials.filter(material_id=code).update(supply_method=SupplyMethod.CHILD_PLAN)

    ProductionPlan.objects.filter(pk__in=ids).update(status=ProductionPlan.Status.MERGED, merged_into=merged)
    return merged


def release_merged_plans(merged):
    """統合計画から元の計画を切り離し、未着手に戻す。統合のとき中止した子計画は、元の計画で作り直す。"""
    originals = list(merged.merged_plans.all())
    merged.merged_plans.update(status=ProductionPlan.Status.PENDING, merged_into=None)
    for plan in originals:
        plan.refresh_from_db()
        # 子計画で賄う設定のまま子計画がなくなっている中間品は、手配し直す
        for material in plan.materials.filter(supply_method=SupplyMethod.CHILD_PLAN):
            if not plan.child_plans.filter(product_id=material.material_id, status__in=OPEN_STATUSES).exists():
                material.supply_method = SupplyMethod.UNDECIDED
                material.save(update_fields=["supply_method"])
        auto_arrange_intermediates(plan)


@transaction.atomic
def unmerge_plan(merged):
    """統合を解除する。統合計画は中止にして履歴として残し、元の計画を未着手に戻す。"""
    merged = ProductionPlan.objects.select_for_update().get(pk=merged.pk)
    if not merged.merged_plans.exists():
        raise ValueError("統合計画ではありません。")
    if merged.status != ProductionPlan.Status.PENDING:
        raise ValueError("未着手の統合計画だけ統合を解除できます。")
    if MaterialAllocation.objects.filter(production_plan=merged).exclude(
        status=MaterialAllocation.Status.RETURNED
    ).exists():
        raise ValueError(apply_terms("部品の引当がある統合計画は解除できません。先に引当を解除してください。"))
    # 統合計画を中止してから(統合計画の子計画も中止される)、元の計画の子計画を作り直す
    merged.status = ProductionPlan.Status.CANCELLED
    merged.save(update_fields=["status", "updated_at"])
    release_merged_plans(merged)
    return merged


def apportion_completion(merged, good_quantity):
    """
    統合計画の良品数を、元計画に納期順で割り振って完了にする。
    各計画には計画数量まで割り振り、計画数量を超えた分(余剰)は最後の計画に加える。在庫への計上は統合計画で済んでいる。
    完成品の入庫倉庫・棚番は統合計画と同じものを記録する(元計画の完了を取り消す場合も同じ倉庫から減らすため)。
    """
    originals = sorted(merged.merged_plans.all(), key=_order_key)
    remaining = good_quantity
    for i, plan in enumerate(originals):
        qty = remaining if i == len(originals) - 1 else min(plan.planned_quantity, remaining)
        remaining -= qty
        plan.status = ProductionPlan.Status.COMPLETED
        plan.actual_start_datetime = merged.actual_start_datetime
        plan.actual_end_datetime = merged.actual_end_datetime
        plan.finished_goods_warehouse = merged.finished_goods_warehouse
        plan.finished_goods_location = merged.finished_goods_location
        plan.save(
            update_fields=[
                "status",
                "actual_start_datetime",
                "actual_end_datetime",
                "finished_goods_warehouse",
                "finished_goods_location",
                "updated_at",
            ]
        )
        progress, _ = WorkProgress.objects.get_or_create(production_plan=plan, process_step=OVERALL_PROCESS_STEP)
        progress.status = WorkProgress.Status.COMPLETED
        progress.quantity_completed = qty
        progress.start_datetime = merged.actual_start_datetime
        progress.end_datetime = merged.actual_end_datetime
        progress.save()


def reverse_apportion(merged):
    """統合計画の完了を取り消したとき、元計画を統合済に戻す。"""
    for plan in merged.merged_plans.all():
        plan.status = ProductionPlan.Status.MERGED
        plan.actual_start_datetime = None
        plan.actual_end_datetime = None
        plan.finished_goods_warehouse = None
        plan.finished_goods_location = None
        plan.save(
            update_fields=[
                "status",
                "actual_start_datetime",
                "actual_end_datetime",
                "finished_goods_warehouse",
                "finished_goods_location",
                "updated_at",
            ]
        )
        WorkProgress.objects.filter(production_plan=plan, process_step=OVERALL_PROCESS_STEP).update(
            status=WorkProgress.Status.NOT_STARTED, quantity_completed=0, end_datetime=None
        )
