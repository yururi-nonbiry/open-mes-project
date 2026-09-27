"""
生産計画ごとの所要部品(ProductionPlanMaterial)の作成・再計算と、所要量の消化状況の集計。
"""

from decimal import ROUND_CEILING, Decimal

from django.db.models import Sum

from master.models import BillOfMaterial

from ..models import MaterialAllocation, ProductionPlanMaterial


def calc_required_quantity(quantity_per_unit, planned_quantity):
    """1個あたり所要数量 × 計画数量。在庫は整数管理のため端数は切り上げる。"""
    return int((Decimal(quantity_per_unit) * planned_quantity).to_integral_value(rounding=ROUND_CEILING))


def snapshot_plan_materials(plan):
    """
    BOMマスターの直下の子品目で、生産計画の所要部品を作り直す(計画ごとの編集内容は破棄される)。
    """
    plan.materials.all().delete()
    if not plan.product_id:
        return []
    rows = [
        ProductionPlanMaterial(
            production_plan=plan,
            material_id=bom.material_id,
            quantity_per_unit=bom.quantity,
            required_quantity=calc_required_quantity(bom.quantity, plan.planned_quantity),
            remarks=bom.remarks,
        )
        for bom in BillOfMaterial.objects.filter(product_id=plan.product_id)
    ]
    return ProductionPlanMaterial.objects.bulk_create(rows)


def recalculate_required_quantities(plan):
    """計画数量の変更に合わせて所要数量を再計算する。"""
    for material in plan.materials.all():
        required = calc_required_quantity(material.quantity_per_unit, plan.planned_quantity)
        if material.required_quantity != required:
            material.required_quantity = required
            material.save(update_fields=["required_quantity", "updated_at"])


def normal_allocations(queryset=None):
    """所要量の消化に数える引当(通常引当のうち返却済みを除く)。"""
    queryset = MaterialAllocation.objects.all() if queryset is None else queryset
    return queryset.filter(allocation_type=MaterialAllocation.AllocationType.NORMAL).exclude(
        status=MaterialAllocation.Status.RETURNED
    )


def allocated_quantity_by_material(plan):
    """計画の所要量に対して引当済みの数量 {部品コード: 数量}。"""
    rows = (
        normal_allocations(MaterialAllocation.objects.filter(production_plan=plan))
        .values("material_id")
        .annotate(total=Sum("allocated_quantity"))
    )
    return {row["material_id"]: row["total"] for row in rows}


def additional_issued_quantity_by_material(plan):
    """計画に対して追加出庫した数量(返却分を除く) {部品コード: 数量}。"""
    rows = (
        MaterialAllocation.objects.filter(
            production_plan=plan,
            allocation_type=MaterialAllocation.AllocationType.ADDITIONAL,
            status=MaterialAllocation.Status.ISSUED,
        )
        .values("material_id")
        .annotate(total=Sum("allocated_quantity"))
    )
    return {row["material_id"]: row["total"] for row in rows}
