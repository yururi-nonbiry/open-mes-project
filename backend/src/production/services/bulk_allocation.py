"""
生産計画の一覧で使う、引当状況のまとめ表示と、複数計画のまとめ引当。
"""

from master.models import BillOfMaterial

from ..models import ProductionPlan
from .allocation import allocate_materials_service
from .queries import get_production_plan_required_parts

# 材料引当の対象にしない計画の状態
NOT_ALLOCATABLE_STATUSES = (ProductionPlan.Status.COMPLETED, ProductionPlan.Status.CANCELLED)


class AllocationState:
    NO_MASTER = "NO_MASTER"  # 製品の構成マスター(BOM)が未登録
    NO_PARTS = "NO_PARTS"  # BOMはあるが、計画に所要部品がない
    ALLOCATED = "ALLOCATED"  # すべての所要を引当済み
    READY = "READY"  # 未引当があり、在庫は足りている
    SHORTAGE = "SHORTAGE"  # 在庫を全部使っても所要に足りない部品がある


def _still_needed(part):
    return max(0, part["required_quantity"] - part["already_allocated_quantity"])


def _total_available(part):
    return sum(w["available_quantity"] for w in part["warehouses"])


def get_allocation_overview(plan, has_bom=None):
    """計画1件の引当状況(マスターの有無・引当の進み具合・在庫が足りているか)を返す。"""
    if has_bom is None:
        has_bom = BillOfMaterial.objects.filter(product_id=plan.product_id).exists()
    parts = get_production_plan_required_parts(plan)

    if not parts:
        state = AllocationState.NO_PARTS if has_bom else AllocationState.NO_MASTER
        return {
            "plan_id": plan.id,
            "state": state,
            "has_bom": has_bom,
            "part_count": 0,
            "allocated_part_count": 0,
            "shortage_part_count": 0,
            "shortage_parts": [],
        }

    unallocated = [p for p in parts if _still_needed(p) > 0]
    shortage = [p for p in unallocated if _still_needed(p) > _total_available(p)]
    if shortage:
        state = AllocationState.SHORTAGE
    elif unallocated:
        state = AllocationState.READY
    else:
        state = AllocationState.ALLOCATED
    return {
        "plan_id": plan.id,
        "state": state,
        "has_bom": has_bom,
        "part_count": len(parts),
        "allocated_part_count": len(parts) - len(unallocated),
        "shortage_part_count": len(shortage),
        "shortage_parts": [p["part_code"] for p in shortage],
    }


def build_auto_allocations(plan):
    """
    未引当の所要数を、引当可能数の多い倉庫から順に引き当てる内容を作る(1つの倉庫で足りなければ複数の倉庫に分ける)。
    在庫が足りない部品は、引き当てられる分だけを引き当てる。
    """
    allocations = []
    for part in get_production_plan_required_parts(plan):
        remaining = _still_needed(part)
        for w in part["warehouses"]:  # 引当可能数の多い順
            if remaining <= 0:
                break
            qty = min(remaining, int(w["available_quantity"]))
            if qty <= 0:
                continue
            allocations.append({"part_number": part["part_code"], "warehouse": w["warehouse"], "quantity_to_allocate": qty})
            remaining -= qty
    return allocations


def bulk_allocate_materials(plans):
    """
    複数の生産計画をまとめて引き当てる。計画ごとに独立して処理し、失敗した計画は引当せずに理由を返す。
    戻り値: 計画ごとの結果のリスト。
    """
    results = []
    for plan in plans:
        result = {"plan_id": plan.id, "plan_name": plan.plan_name, "status": "", "message": "", "allocated_count": 0}
        if plan.status in NOT_ALLOCATABLE_STATUSES:
            result.update(status="skipped", message="完了・中止の計画は引き当てできません。")
        else:
            overview = get_allocation_overview(plan)
            if overview["state"] == AllocationState.NO_MASTER:
                result.update(status="skipped", message="構成マスター(BOM)が登録されていません。")
            elif overview["state"] == AllocationState.NO_PARTS:
                result.update(status="skipped", message="所要部品がありません。")
            else:
                allocations = build_auto_allocations(plan)
                if not allocations:
                    message = "すべて引当済みです。" if overview["state"] == AllocationState.ALLOCATED else "引当可能な在庫がありません。"
                    result.update(status="skipped", message=message)
                else:
                    try:
                        summary = allocate_materials_service(plan, allocations)
                    except ValueError as e:
                        result.update(status="error", message=str(e))
                    else:
                        shortage = overview["shortage_part_count"]
                        result.update(
                            status="partial" if shortage else "success",
                            message=f"在庫不足の部品が{shortage}件あり、引き当てられる分のみ引き当てました。" if shortage else "引き当てました。",
                            allocated_count=len(summary),
                        )
        results.append(result)
    return results
