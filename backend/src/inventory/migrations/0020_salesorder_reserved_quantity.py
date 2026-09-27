from django.db import migrations, models
from django.db.models import Sum


def backfill_reserved_quantity(apps, schema_editor):
    """
    既存の引当(Inventory.reserved)は受注との対応関係を持たないため、品番+倉庫ごとの引当プールから
    生産計画の材料引当(ALLOCATED)分を差し引いた残りを、受注日が古い未出庫の受注から順に
    残数量を上限として割り当てる。
    """
    Inventory = apps.get_model("inventory", "Inventory")
    SalesOrder = apps.get_model("inventory", "SalesOrder")
    MaterialAllocation = apps.get_model("production", "MaterialAllocation")

    pools = {}
    for row in (
        Inventory.objects.filter(reserved__gt=0)
        .values("part_number_rel_id", "warehouse_rel_id")
        .annotate(total=Sum("reserved"))
    ):
        pools[(row["part_number_rel_id"], row["warehouse_rel_id"])] = row["total"]

    for row in (
        MaterialAllocation.objects.filter(status="ALLOCATED")
        .values("material_id", "warehouse_rel_id")
        .annotate(total=Sum("allocated_quantity"))
    ):
        key = (row["material_id"], row["warehouse_rel_id"])
        if key in pools:
            pools[key] = max(0, pools[key] - row["total"])

    orders = (
        SalesOrder.objects.filter(status="pending")
        .exclude(order_number__startswith="INT-")
        .order_by("order_date", "order_number")
    )
    for order in orders:
        key = (order.item_rel_id, order.warehouse_rel_id)
        pool = pools.get(key, 0)
        if pool <= 0:
            continue
        assign = min(pool, max(0, order.quantity - order.shipped_quantity))
        if assign > 0:
            order.reserved_quantity = assign
            order.save(update_fields=["reserved_quantity"])
            pools[key] = pool - assign


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0019_inventory_first_received_at"),
        ("production", "0008_workprogress_unique_workprogress_plan_process_step"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesorder",
            name="reserved_quantity",
            field=models.PositiveIntegerField(default=0, verbose_name="引当済数量"),
        ),
        migrations.RunPython(backfill_reserved_quantity, migrations.RunPython.noop),
    ]
