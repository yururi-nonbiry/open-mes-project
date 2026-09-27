"""
多階層BOM(使用部品構成)の展開と循環参照チェック。

BOM の1行は「親品目(製品・中間品) 1個あたりに 子品目(材料・中間品) を quantity 使う」ことを表す。
中間品は自身の生産計画で作って在庫に入れ、上位の生産計画がその在庫を引き当てて使う。
そのため生産計画の所要部品は直下の子品目のみ(1階層)で、ここでの全階層展開は構成の確認や
最下位の材料の総所要量の把握に使う。
"""

from collections import defaultdict
from decimal import Decimal

from .models import BillOfMaterial

QUANTITY_PLACES = Decimal("0.001")
# 循環参照はBOM登録時に防いでいるが、万一データが壊れていても無限再帰しないための上限
MAX_BOM_DEPTH = 20


class BomCycleError(Exception):
    pass


def creates_cycle(product_code, material_code, exclude_bom_id=None):
    """product の子として material を追加すると循環参照(自分自身を部品に含む)になるか。"""
    if product_code == material_code:
        return True
    rows = BillOfMaterial.objects.all()
    if exclude_bom_id:
        rows = rows.exclude(pk=exclude_bom_id)
    children_by_parent = defaultdict(list)
    for parent, child in rows.values_list("product_id", "material_id"):
        children_by_parent[parent].append(child)

    # material 以下を辿って product に行き着けば循環
    stack, seen = [material_code], set()
    while stack:
        code = stack.pop()
        if code == product_code:
            return True
        if code in seen:
            continue
        seen.add(code)
        stack.extend(children_by_parent.get(code, []))
    return False


def _format_quantity(value):
    return str(value.quantize(QUANTITY_PLACES))


def explode_bom(product_code, quantity=Decimal(1)):
    """
    product を quantity 個作るときの構成を全階層で展開する。

    戻り値:
        {
            "tree": [{"item_code", "item_name", "item_type", "unit", "level",
                      "quantity_per_parent", "required_quantity", "children": [...]}, ...],
            "totals": [{"item_code", "item_name", "unit", "required_quantity"}, ...],  # 最下位の品目ごとの合計
        }
    """
    children_by_parent = defaultdict(list)
    for bom in BillOfMaterial.objects.select_related("material").order_by("material__code"):
        children_by_parent[bom.product_id].append(bom)

    totals = {}

    def build(parent_code, parent_quantity, level, path):
        if level > MAX_BOM_DEPTH or parent_code in path:
            raise BomCycleError(f"品目 {parent_code} のBOMが循環しているか、階層が深すぎます。")
        nodes = []
        for bom in children_by_parent.get(parent_code, []):
            material = bom.material
            required = bom.quantity * parent_quantity
            children = build(material.code, required, level + 1, path | {parent_code})
            if not children:
                total = totals.setdefault(
                    material.code,
                    {"item_code": material.code, "item_name": material.name, "unit": material.unit, "quantity": 0},
                )
                total["quantity"] += required
            nodes.append(
                {
                    "item_code": material.code,
                    "item_name": material.name,
                    "item_type": material.item_type,
                    "unit": material.unit,
                    "level": level,
                    "quantity_per_parent": _format_quantity(bom.quantity),
                    "required_quantity": _format_quantity(required),
                    "children": children,
                }
            )
        return nodes

    tree = build(product_code, Decimal(quantity), 1, frozenset())
    return {
        "tree": tree,
        "totals": [
            {
                "item_code": t["item_code"],
                "item_name": t["item_name"],
                "unit": t["unit"],
                "required_quantity": _format_quantity(t["quantity"]),
            }
            for t in sorted(totals.values(), key=lambda t: t["item_code"])
        ],
    }
