import django.db.models.deletion
from django.db import migrations, models


def ensure_no_invalid_inventory(apps, schema_editor):
    """品番・倉庫が未設定、または引当済数量が不正な在庫があれば、制約を足す前に内容を示して止める。"""
    Inventory = apps.get_model("inventory", "Inventory")
    missing = Inventory.objects.filter(
        models.Q(part_number_rel__isnull=True) | models.Q(warehouse_rel__isnull=True)
    ).values_list("pk", flat=True)
    invalid = Inventory.objects.filter(
        models.Q(reserved__lt=0) | models.Q(quantity__lt=models.F("reserved"))
    ).values_list("pk", flat=True)
    problems = []
    if missing:
        problems.append(f"品番または倉庫が未設定の在庫: {', '.join(str(pk) for pk in missing[:20])}")
    if invalid:
        problems.append(f"引当済数量が負、または在庫数量を超える在庫: {', '.join(str(pk) for pk in invalid[:20])}")
    if problems:
        raise RuntimeError(
            "在庫データに制約違反があるため移行できません。該当する在庫を修正してから再実行してください。\n"
            + "\n".join(problems)
        )


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0027_salesorder_created_at"),
        ("master", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(ensure_no_invalid_inventory, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="inventory",
            name="part_number_rel",
            field=models.ForeignKey(
                db_column="part_number",
                on_delete=django.db.models.deletion.PROTECT,
                to="master.item",
                to_field="code",
                verbose_name="品番",
            ),
        ),
        migrations.AlterField(
            model_name="inventory",
            name="warehouse_rel",
            field=models.ForeignKey(
                db_column="warehouse",
                on_delete=django.db.models.deletion.PROTECT,
                to="master.warehouse",
                to_field="warehouse_number",
                verbose_name="倉庫",
            ),
        ),
        migrations.AddConstraint(
            model_name="inventory",
            constraint=models.CheckConstraint(
                condition=models.Q(("reserved__gte", 0), ("quantity__gte", models.F("reserved"))),
                name="inventory_quantity_gte_reserved_gte_zero",
            ),
        ),
    ]
