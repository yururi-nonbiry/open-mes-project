from collections import defaultdict

from django.db.models import Q, Sum

from inventory.models import Inventory

from ..models import MaterialAllocation, ProductionPlanMaterial
from .materials import normal_allocations


def get_production_plan_required_parts(production_plan_instance):
    """
    生産計画の所要部品と、部品ごとの在庫(倉庫別の引当可能数)・引当状況を返します。
    倉庫は引当時に選ぶため、引当可能な在庫がある倉庫を候補として返します。
    """
    return get_required_parts_for_plans([production_plan_instance])[production_plan_instance.pk]


def get_required_parts_for_plans(plans):
    """
    複数の計画の所要部品(get_production_plan_required_parts と同じ形)を {計画ID: [部品...]} で返す。
    計画の件数によらず一定回数のクエリで求める(一覧で計画ごとに問い合わせると、件数に比例してクエリが増えるため)。
    """
    plans = list(plans)
    results = {plan.pk: [] for plan in plans}
    if not plans:
        return results
    plan_ids = [plan.pk for plan in plans]

    materials_by_plan = defaultdict(list)
    for m in ProductionPlanMaterial.objects.filter(production_plan_id__in=plan_ids).select_related("material"):
        materials_by_plan[m.production_plan_id].append(m)
    part_codes = {m.material_id for values in materials_by_plan.values() for m in values}
    if not part_codes:
        return results

    # 部品・倉庫・用途ごとの引当可能数。計画が使える在庫は、計画の用途の在庫と汎用の在庫(他の用途の在庫は使えない)
    purposes = {plan.purpose for plan in plans if plan.purpose}
    usable = Q(purpose_rel__isnull=True) | Q(purpose_rel_id__in=purposes)
    available = defaultdict(int)  # (部品, 倉庫, 用途) -> 数量
    for inv in Inventory.objects.filter(usable, part_number_rel_id__in=part_codes, is_active=True, is_allocatable=True):
        available[(inv.part_number, inv.warehouse, inv.purpose)] += inv.available_quantity or 0

    allocated = _sum_by_plan_material(normal_allocations(MaterialAllocation.objects.filter(production_plan_id__in=plan_ids)))
    additional = _sum_by_plan_material(
        MaterialAllocation.objects.filter(
            production_plan_id__in=plan_ids,
            allocation_type=MaterialAllocation.AllocationType.ADDITIONAL,
            status=MaterialAllocation.Status.ISSUED,
        )
    )

    for plan in plans:
        usable_purposes = {None, plan.purpose or None}
        for m in materials_by_plan.get(plan.pk, []):
            by_warehouse = defaultdict(int)
            for (part, warehouse, purpose), qty in available.items():
                if part == m.material_id and purpose in usable_purposes:
                    by_warehouse[warehouse] += qty
            results[plan.pk].append(
                {
                    "part_code": m.material_id,
                    "part_name": m.material.name,
                    "unit": m.material.unit,
                    "quantity_per_unit": m.quantity_per_unit,
                    "required_quantity": m.required_quantity,
                    "already_allocated_quantity": allocated.get((plan.pk, m.material_id), 0),
                    "additional_issued_quantity": additional.get((plan.pk, m.material_id), 0),
                    "inventory_quantity": sum(by_warehouse.values()),
                    # 引当可能数の多い倉庫から並べる(画面の既定の選択肢)
                    "warehouses": [
                        {"warehouse": warehouse, "available_quantity": qty}
                        for warehouse, qty in sorted(by_warehouse.items(), key=lambda kv: (-kv[1], str(kv[0])))
                        if qty > 0
                    ],
                }
            )
    return results


def _sum_by_plan_material(queryset):
    rows = queryset.values("production_plan_id", "material_id").annotate(total=Sum("allocated_quantity"))
    return {(row["production_plan_id"], row["material_id"]): row["total"] for row in rows}
