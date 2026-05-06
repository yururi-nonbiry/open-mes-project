from django.db.models import Sum

from inventory.models import Inventory
from ..models import MaterialAllocation, PartsUsed

def get_production_plan_required_parts(production_plan_instance):
    """
    特定の生産計画に必要な部品リストとその現在の在庫・引当状況を返します。
    クエリを最適化し、N+1問題を回避しています。
    """
    plan_identifier = production_plan_instance.production_plan
    if not plan_identifier:
        return []

    # 1. 使用部品情報を一括取得
    parts_used_queryset = PartsUsed.objects.filter(production_plan=plan_identifier)
    if not parts_used_queryset.exists():
        return []

    part_codes = list(parts_used_queryset.values_list("part_code", flat=True).distinct())

    # 2. 在庫情報を一括取得
    inventory_items = Inventory.objects.filter(part_number__in=part_codes, is_active=True, is_allocatable=True)

    # 在庫データをマッピング (part_code -> {warehouse -> quantity}) または (part_code -> total_quantity)
    inventory_map = {}
    for inv in inventory_items:
        if inv.part_number not in inventory_map:
            inventory_map[inv.part_number] = {}
        inventory_map[inv.part_number][inv.warehouse] = inventory_map[inv.part_number].get(inv.warehouse, 0) + (
            inv.available_quantity or 0
        )

    # 3. 引当済情報を一括取得
    allocations = (
        MaterialAllocation.objects.filter(production_plan=production_plan_instance, material_code__in=part_codes)
        .values("material_code")
        .annotate(total_allocated=Sum("allocated_quantity"))
    )
    allocation_map = {a["material_code"]: a["total_allocated"] for a in allocations}

    # 4. 結果の組み立て
    results = []
    for part_used in parts_used_queryset:
        part_code = part_used.part_code
        target_warehouse = part_used.warehouse

        # 在庫数量の計算
        if target_warehouse:
            # 特定の倉庫が指定されている場合
            current_inventory_quantity = inventory_map.get(part_code, {}).get(target_warehouse, 0)
        else:
            # 倉庫指定がない場合、全倉庫の合計
            current_inventory_quantity = sum(inventory_map.get(part_code, {}).values())

        results.append(
            {
                "part_code": part_code,
                "part_name": f"{part_code} (名称は別途マスタ参照)",  # TODO: マスタ連携
                "required_quantity": part_used.quantity_used,
                "unit": "個",
                "inventory_quantity": current_inventory_quantity,
                "warehouse": target_warehouse,
                "already_allocated_quantity": allocation_map.get(part_code, 0),
            }
        )

    return results
