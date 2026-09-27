from inventory.models import Inventory

from .materials import additional_issued_quantity_by_material, allocated_quantity_by_material


def get_production_plan_required_parts(production_plan_instance):
    """
    生産計画の所要部品と、部品ごとの在庫(倉庫別の引当可能数)・引当状況を返します。
    倉庫は引当時に選ぶため、引当可能な在庫がある倉庫を候補として返します。
    """
    materials = list(production_plan_instance.materials.select_related("material"))
    if not materials:
        return []
    part_codes = [m.material_id for m in materials]

    available_by_warehouse = {}
    for inv in Inventory.objects.filter(part_number_rel_id__in=part_codes, is_active=True, is_allocatable=True):
        by_warehouse = available_by_warehouse.setdefault(inv.part_number, {})
        by_warehouse[inv.warehouse] = by_warehouse.get(inv.warehouse, 0) + (inv.available_quantity or 0)

    allocated = allocated_quantity_by_material(production_plan_instance)
    additional = additional_issued_quantity_by_material(production_plan_instance)

    results = []
    for m in materials:
        by_warehouse = available_by_warehouse.get(m.material_id, {})
        results.append(
            {
                "part_code": m.material_id,
                "part_name": m.material.name,
                "unit": m.material.unit,
                "quantity_per_unit": m.quantity_per_unit,
                "required_quantity": m.required_quantity,
                "already_allocated_quantity": allocated.get(m.material_id, 0),
                "additional_issued_quantity": additional.get(m.material_id, 0),
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
