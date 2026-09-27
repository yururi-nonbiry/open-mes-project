from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations


def forwards(apps, schema_editor):
    """
    旧来の PartsUsed(参照生産計画の文字列キー単位で、計画全体の使用数量を持つ部品構成)を、
    その キーを参照している生産計画ごとの所要部品(ProductionPlanMaterial)に移す。

    所要数量(計画全体)は元の数量をそのまま引き継ぎ、1個あたり所要数量は 元の数量 / 計画数量 から求める
    (1個あたり所要数量は小数3桁に丸めるため、計画数量を後から変えた場合の再計算結果は元の比率と僅かにずれうる)。
    PartsUsed の倉庫指定は引き継がない(倉庫は引当時に選ぶ)。
    """
    PartsUsed = apps.get_model("production", "PartsUsed")
    ProductionPlan = apps.get_model("production", "ProductionPlan")
    ProductionPlanMaterial = apps.get_model("production", "ProductionPlanMaterial")

    quantity_by_key = defaultdict(lambda: defaultdict(int))
    for row in PartsUsed.objects.exclude(part__isnull=True):
        quantity_by_key[row.production_plan][row.part_id] += row.quantity_used

    new_rows = []
    for plan in ProductionPlan.objects.filter(production_plan__in=list(quantity_by_key.keys())):
        if ProductionPlanMaterial.objects.filter(production_plan=plan).exists():
            continue
        for part_code, total in quantity_by_key[plan.production_plan].items():
            if part_code == plan.product_id:
                continue
            per_unit = Decimal(total) / plan.planned_quantity if plan.planned_quantity else Decimal(total)
            new_rows.append(
                ProductionPlanMaterial(
                    production_plan=plan,
                    material_id=part_code,
                    quantity_per_unit=max(
                        per_unit.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP), Decimal("0.001")
                    ),
                    required_quantity=total,
                    remarks="使用部品(PartsUsed)から移行",
                )
            )
    ProductionPlanMaterial.objects.bulk_create(new_rows)


class Migration(migrations.Migration):
    dependencies = [
        ("production", "0009_plan_materials"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
