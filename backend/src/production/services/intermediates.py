"""
中間品の手配(子計画の作成)。

生産計画の所要部品のうち中間品について、計画開始時点で使える見込み数を求め、
- 見込みが足りない場合は、不足分を作る子計画を自動で作成する
- 見込みで足りる場合は、子計画を立てるか在庫を使うかを利用者が選ぶ(ProductionPlanMaterial.supply_method)
"""

from collections import defaultdict
from datetime import timedelta

from django.db import transaction
from django.db.models import Sum

from inventory.models import Inventory
from master.models import Item

from ..models import MaterialAllocation, ProductionPlan, ProductionPlanMaterial
from .materials import allocated_quantity_by_material, normal_allocations

# 手配の対象・需要と供給の見込みに数える計画のステータス(保留・完了・中止は数えない)
OPEN_STATUSES = (ProductionPlan.Status.PENDING, ProductionPlan.Status.IN_PROGRESS)
# 子計画の子計画…と自動作成する深さの上限(BOMは循環しないが、念のための歯止め)
MAX_ARRANGE_DEPTH = 10

SupplyMethod = ProductionPlanMaterial.SupplyMethod


class IntermediateStatus:
    SHORTAGE = "SHORTAGE"  # 見込みが足りない(子計画が必要)
    DECISION_REQUIRED = "DECISION_REQUIRED"  # 見込みで足りる。子計画か在庫かを選ぶ
    COVERED = "COVERED"  # 手配済み(子計画で賄う・在庫を使うと決定済み・引当済み)


def _intermediate_materials(plan):
    return list(
        plan.materials.filter(material__item_type="intermediate").select_related("material").order_by("material__code")
    )


def _projected_available(plan, codes):
    """
    計画の開始時点で、この計画が使える中間品の見込み数 {品目コード: 数量}。

    未引当の在庫 + 開始時点までに終わる他の生産計画の生産予定(この計画の子計画を除く)
    - 開始時点までに始まる他の計画の未引当の所要数、で求める。
    """
    start = plan.planned_start_datetime
    projected = defaultdict(int)
    for inv in Inventory.objects.filter(part_number_rel_id__in=codes, is_active=True, is_allocatable=True):
        projected[inv.part_number] += inv.available_quantity

    supply = (
        ProductionPlan.objects.filter(product_id__in=codes, status__in=OPEN_STATUSES, planned_end_datetime__lte=start)
        .exclude(parent_plan=plan)
        .exclude(pk=plan.pk)
        .values("product_id")
        .annotate(total=Sum("planned_quantity"))
    )
    for row in supply:
        projected[row["product_id"]] += row["total"]

    demand_materials = ProductionPlanMaterial.objects.filter(
        material_id__in=codes,
        production_plan__status__in=OPEN_STATUSES,
        production_plan__planned_start_datetime__lte=start,
    ).exclude(production_plan=plan)
    required = defaultdict(int)
    for row in demand_materials.values("production_plan_id", "material_id", "required_quantity"):
        required[(row["production_plan_id"], row["material_id"])] += row["required_quantity"]
    allocated_rows = (
        normal_allocations(MaterialAllocation.objects.filter(material_id__in=codes))
        .filter(production_plan_id__in={key[0] for key in required})
        .values("production_plan_id", "material_id")
        .annotate(total=Sum("allocated_quantity"))
    )
    allocated = {(row["production_plan_id"], row["material_id"]): row["total"] for row in allocated_rows}
    for key, quantity in required.items():
        projected[key[1]] -= max(quantity - allocated.get(key, 0), 0)
    return projected


def get_intermediate_requirements(plan):
    """
    計画の所要部品のうち中間品ごとの手配状況を返す。

    status:
      SHORTAGE          開始時点の見込み(在庫・他の生産予定)と子計画を合わせても足りない
      DECISION_REQUIRED 見込みで足りるが、子計画を立てるか在庫を使うかが未決定
      COVERED           手配済み
    """
    materials = _intermediate_materials(plan)
    if not materials:
        return []
    codes = [m.material_id for m in materials]
    projected = _projected_available(plan, codes)
    allocated = allocated_quantity_by_material(plan)

    child_plans = defaultdict(list)
    for child in ProductionPlan.objects.filter(parent_plan=plan, product_id__in=codes).order_by("planned_start_datetime"):
        child_plans[child.product_id].append(child)

    results = []
    for m in materials:
        code = m.material_id
        remaining_need = max(m.required_quantity - allocated.get(code, 0), 0)
        children = child_plans.get(code, [])
        child_planned = sum(c.planned_quantity for c in children if c.status in OPEN_STATUSES)
        uncovered = max(remaining_need - child_planned, 0)
        projected_available = projected.get(code, 0)
        shortage = max(uncovered - max(projected_available, 0), 0)
        if shortage > 0:
            item_status = IntermediateStatus.SHORTAGE
        elif uncovered > 0 and m.supply_method == SupplyMethod.UNDECIDED:
            item_status = IntermediateStatus.DECISION_REQUIRED
        else:
            item_status = IntermediateStatus.COVERED
        results.append(
            {
                "material_code": code,
                "material_name": m.material.name,
                "unit": m.material.unit,
                "required_quantity": m.required_quantity,
                "allocated_quantity": allocated.get(code, 0),
                "child_planned_quantity": child_planned,
                "projected_available_quantity": projected_available,
                "uncovered_quantity": uncovered,
                "shortage_quantity": shortage,
                "supply_method": m.supply_method,
                "supply_method_display": m.get_supply_method_display(),
                "status": item_status,
                "child_plans": [
                    {
                        "id": c.id,
                        "plan_name": c.plan_name,
                        "planned_quantity": c.planned_quantity,
                        "planned_start_datetime": c.planned_start_datetime,
                        "planned_end_datetime": c.planned_end_datetime,
                        "status": c.status,
                        "status_display": c.get_status_display(),
                    }
                    for c in children
                ],
            }
        )
    return results


def create_child_plan(parent, material, quantity, depth=0):
    """
    中間品を作る子計画を作成する。親の開始までに終わるよう、終了を親の開始日時に合わせ、
    期間は中間品のリードタイム(日)。リードタイム未設定の場合は親と同じ期間を取る。
    子計画の所要部品はBOMマスターからコピーされ、さらに中間品が不足していれば孫計画も作られる(signals)。
    """
    end = parent.planned_start_datetime
    duration = timedelta(days=material.lead_time_days) if material.lead_time_days else None
    if not duration:
        duration = parent.planned_end_datetime - parent.planned_start_datetime
    if duration <= timedelta(0):
        duration = timedelta(hours=1)
    child = ProductionPlan(
        plan_name=f"{parent.plan_name} / {material.code}"[:255],
        product=material,
        parent_plan=parent,
        planned_quantity=quantity,
        planned_start_datetime=end - duration,
        planned_end_datetime=end,
        status=ProductionPlan.Status.PENDING,
        remarks=f"生産計画「{parent.plan_name}」で使う中間品 {material.code} の子計画",
    )
    child._arrange_depth = depth + 1  # signals.sync_plan_materials が孫計画の自動作成に使う
    child.save()
    ProductionPlanMaterial.objects.filter(production_plan=parent, material=material).update(
        supply_method=SupplyMethod.CHILD_PLAN
    )
    return child


def auto_arrange_intermediates(plan, depth=0):
    """見込みが足りない中間品について、不足分の子計画を作成する。作成した子計画のリストを返す。"""
    if plan.status not in OPEN_STATUSES or depth >= MAX_ARRANGE_DEPTH:
        return []
    created = []
    handled = set()
    while True:
        # 子計画も他の中間品を使うことがあるため、1件作るごとに見込みを求め直す
        shortage = next(
            (
                r
                for r in get_intermediate_requirements(plan)
                if r["shortage_quantity"] > 0 and r["material_code"] not in handled
            ),
            None,
        )
        if shortage is None:
            return created
        handled.add(shortage["material_code"])
        material = Item.objects.get(code=shortage["material_code"])
        created.append(create_child_plan(plan, material, shortage["shortage_quantity"], depth=depth))


def arrange_intermediates_service(plan, decisions):
    """
    中間品ごとの手配方法を決める。

    decisions: [{"material_code", "method": "CHILD_PLAN" | "STOCK", "quantity"(CHILD_PLAN のとき任意)}]
      CHILD_PLAN: 子計画を作成する。数量省略時は子計画・引当でまだ賄えていない数量。
      STOCK: 在庫(見込み)を使う。見込みが足りない場合は選べない。
    作成した子計画のリストを返す。
    """
    if plan.status not in OPEN_STATUSES:
        raise ValueError("未着手・進行中の生産計画だけ中間品を手配できます。")
    if not isinstance(decisions, list) or not decisions:
        raise ValueError("手配する中間品を指定してください。")

    requirements = {r["material_code"]: r for r in get_intermediate_requirements(plan)}
    created = []
    with transaction.atomic():
        for decision in decisions:
            if not isinstance(decision, dict):
                raise ValueError("手配の指定が不正です。")
            code = decision.get("material_code")
            requirement = requirements.get(code)
            if requirement is None:
                raise ValueError(f"中間品 {code} はこの計画の部品構成にありません。")
            method = decision.get("method")
            if method == SupplyMethod.STOCK:
                if requirement["shortage_quantity"] > 0:
                    raise ValueError(
                        f"中間品 {code} は在庫の見込みが {requirement['shortage_quantity']} 不足しているため、在庫では賄えません。"
                    )
                ProductionPlanMaterial.objects.filter(production_plan=plan, material_id=code).update(
                    supply_method=SupplyMethod.STOCK
                )
            elif method == SupplyMethod.CHILD_PLAN:
                quantity = decision.get("quantity")
                if quantity in (None, ""):
                    quantity = requirement["uncovered_quantity"]
                    if quantity <= 0:
                        raise ValueError(f"中間品 {code} は既に子計画・引当で賄えています。作る数量を指定してください。")
                try:
                    quantity = int(quantity)
                except (TypeError, ValueError):
                    raise ValueError(f"中間品 {code} の数量が不正です。") from None
                if quantity <= 0:
                    raise ValueError(f"中間品 {code} の数量は1以上を指定してください。")
                material = Item.objects.get(code=code)
                created.append(create_child_plan(plan, material, quantity))
            else:
                raise ValueError("手配方法は CHILD_PLAN(子計画を立てる)か STOCK(在庫を使う)を指定してください。")
    return created
