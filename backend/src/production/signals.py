"""
生産計画の所要部品(ProductionPlanMaterial)を計画の作成・変更に追従させる。

計画はAPIのほかCSV取込(base.tasks.import_csv_task の update_or_create)でも作成・更新されるため、
作成経路によらず確実に反映できるよう保存シグナルで処理する。
所要部品を作り直した・所要数が変わった場合は、中間品の子計画も追従させる(不足分は作成し、減った分は減らす)。
計画を中止した場合は、未着手・保留の子計画も中止する。
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import ProductionPlan
from .services.intermediates import (
    auto_arrange_intermediates,
    cancel_child_plans,
    material_required_quantities,
    trim_child_plans,
)
from .services.materials import recalculate_required_quantities, snapshot_plan_materials


@receiver(pre_save, sender=ProductionPlan)
def remember_bom_inputs(sender, instance, **kwargs):
    instance._previous_bom_inputs = None
    if not instance._state.adding:
        instance._previous_bom_inputs = (
            sender.objects.filter(pk=instance.pk).values("product_id", "planned_quantity", "status").first()
        )


@receiver(post_save, sender=ProductionPlan)
def sync_plan_materials(sender, instance, created, raw=False, **kwargs):
    if raw:  # loaddata 時は所要部品もフィクスチャ側に含まれる前提で何もしない
        return
    depth = getattr(instance, "_arrange_depth", 0)
    if created:
        # 新規作成時は BOM マスターの構成をコピーする
        snapshot_plan_materials(instance)
        auto_arrange_intermediates(instance, depth=depth)
        return
    previous = getattr(instance, "_previous_bom_inputs", None)
    if previous is None:
        return

    product_changed = previous["product_id"] != instance.product_id
    quantity_changed = previous["planned_quantity"] != instance.planned_quantity
    previous_required = None
    if product_changed or quantity_changed:
        previous_required = material_required_quantities(instance)
        if product_changed:
            # 製品が変わった場合は構成自体が別物になるため、BOM マスターからコピーし直す
            snapshot_plan_materials(instance)
        else:
            recalculate_required_quantities(instance)

    if instance.status == ProductionPlan.Status.CANCELLED:
        if previous["status"] != ProductionPlan.Status.CANCELLED:
            cancel_child_plans(instance)
    elif previous_required is not None:
        trim_child_plans(instance, previous_required)
        auto_arrange_intermediates(instance, depth=depth)
