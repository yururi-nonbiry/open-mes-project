from django.db import migrations, models


def merge_null_locations(apps, schema_editor):
    """
    棚番がNULLの在庫を空文字("")の在庫に統合する。NULL同士は一意制約で区別されないため、
    同じ品番・倉庫の「棚番なし」在庫が複数行存在し得る。数量・引当を合算して1行にまとめる。
    """
    Inventory = apps.get_model("inventory", "Inventory")
    keys = (
        Inventory.objects.filter(location__isnull=True)
        .values_list("part_number_rel_id", "warehouse_rel_id")
        .distinct()
    )
    for part_number, warehouse in list(keys):
        rows = list(
            Inventory.objects.filter(
                part_number_rel_id=part_number, warehouse_rel_id=warehouse, location__isnull=True
            ).order_by("first_received_at", "id")
        ) + list(
            Inventory.objects.filter(part_number_rel_id=part_number, warehouse_rel_id=warehouse, location="")
        )
        keeper = rows[0]
        for row in rows[1:]:
            keeper.quantity += row.quantity
            keeper.reserved += row.reserved
            if row.first_received_at and (
                keeper.first_received_at is None or row.first_received_at < keeper.first_received_at
            ):
                keeper.first_received_at = row.first_received_at
            keeper.is_active = keeper.is_active or row.is_active
            row.delete()
        keeper.location = ""
        keeper.save()


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0020_salesorder_reserved_quantity"),
    ]

    operations = [
        migrations.RunPython(merge_null_locations, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="inventory",
            name="location",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="棚番"),
        ),
    ]
