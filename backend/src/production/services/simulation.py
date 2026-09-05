from collections import defaultdict

from django.db.models import Sum

from inventory.models import Inventory
from master.models import Item
from ..models import MaterialAllocation, PartsUsed


def simulate_parts_supply(plans):
    """
    複数の生産計画（納入品番）を横断し、共通部品の供給可否を日付順にシミュレーションします。

    各部品の在庫は生産計画をまたいで共有されるため、`planned_start_datetime` の早い計画から
    順に「未引当の必要数」を積み上げ、現在庫（available_quantity）を超過した時点をその部品の
    供給限界とみなします。超過が発生した計画以降は、その部品を理由に生産不可（feasible=False）
    と判定します。

    Args:
        plans: `planned_start_datetime` 昇順に並んだ ProductionPlan のイテラブル。

    Returns:
        {
            "plans": [
                {
                    "plan_id", "plan_name", "product_code", "planned_start_datetime",
                    "planned_quantity", "status", "feasible", "limiting_parts": [
                        {"part_code", "part_name", "warehouse", "shortage_quantity"}
                    ]
                }, ...
            ],
            "parts": [
                {
                    "part_code", "part_name", "warehouse", "available_quantity",
                    "total_required_quantity", "shortage_quantity",
                    "shortage_plan_id", "shortage_plan_name", "shortage_date",
                }, ...
            ]
        }
    """
    plans = list(plans)

    bom_keys = [p.production_plan for p in plans if p.production_plan]
    parts_used_by_bom_key = defaultdict(list)
    for parts_used in PartsUsed.objects.filter(production_plan__in=bom_keys):
        parts_used_by_bom_key[parts_used.production_plan].append(parts_used)

    part_codes = {pu.part_id for values in parts_used_by_bom_key.values() for pu in values if pu.part_id}
    items_map = {item.code: item.name for item in Item.objects.filter(code__in=part_codes)}

    # (part_code, warehouse) -> 利用可能数量。warehouse指定が無いPartsUsed用に、
    # part_codeのみをキーにした全倉庫合計も別途保持する。
    available_by_part_warehouse = defaultdict(int)
    available_by_part_total = defaultdict(int)
    for inv in Inventory.objects.filter(part_number_rel_id__in=part_codes, is_active=True, is_allocatable=True):
        available_by_part_warehouse[(inv.part_number, inv.warehouse)] += inv.available_quantity
        available_by_part_total[inv.part_number] += inv.available_quantity

    allocation_rows = (
        MaterialAllocation.objects.filter(production_plan__in=plans, material_id__in=part_codes)
        .values("production_plan_id", "material_id")
        .annotate(total=Sum("allocated_quantity"))
    )
    allocated_map = {(row["production_plan_id"], row["material_id"]): row["total"] for row in allocation_rows}

    def resolve_available(part_code, warehouse):
        if warehouse:
            return available_by_part_warehouse.get((part_code, warehouse), 0)
        return available_by_part_total.get(part_code, 0)

    cumulative_required = defaultdict(int)
    part_summary = {}
    plan_results = []

    for plan in plans:
        limiting_parts = []
        for parts_used in parts_used_by_bom_key.get(plan.production_plan, []):
            part_code = parts_used.part_id
            if not part_code:
                continue
            warehouse = parts_used.warehouse
            key = (part_code, warehouse)

            already_allocated = allocated_map.get((plan.id, part_code), 0)
            remaining_required = max(parts_used.quantity_used - already_allocated, 0)
            cumulative_required[key] += remaining_required

            available = resolve_available(part_code, warehouse)
            summary = part_summary.setdefault(
                key,
                {
                    "part_code": part_code,
                    "part_name": items_map.get(part_code, f"{part_code} (名称未登録)"),
                    "warehouse": warehouse,
                    "available_quantity": available,
                    "total_required_quantity": 0,
                    "shortage_quantity": 0,
                    "shortage_plan_id": None,
                    "shortage_plan_name": None,
                    "shortage_date": None,
                },
            )
            summary["total_required_quantity"] = cumulative_required[key]

            if cumulative_required[key] > available:
                shortage_quantity = cumulative_required[key] - available
                summary["shortage_quantity"] = shortage_quantity
                if summary["shortage_plan_id"] is None:
                    # この部品が初めて不足に転じた計画（＝支給元への連絡が必要になる納期）を記録
                    summary["shortage_plan_id"] = plan.id
                    summary["shortage_plan_name"] = plan.plan_name
                    summary["shortage_date"] = plan.planned_start_datetime
                limiting_parts.append(
                    {
                        "part_code": part_code,
                        "part_name": summary["part_name"],
                        "warehouse": warehouse,
                        "shortage_quantity": shortage_quantity,
                    }
                )

        plan_results.append(
            {
                "plan_id": plan.id,
                "plan_name": plan.plan_name,
                "product_code": plan.product_id,
                "planned_start_datetime": plan.planned_start_datetime,
                "planned_quantity": plan.planned_quantity,
                "status": plan.status,
                "feasible": len(limiting_parts) == 0,
                "limiting_parts": limiting_parts,
            }
        )

    return {
        "plans": plan_results,
        "parts": sorted(part_summary.values(), key=lambda p: (p["shortage_date"] is None, p["shortage_date"])),
    }
