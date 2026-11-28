import django.db.models.deletion
from django.db import migrations, models


def check_and_normalize(apps, schema_editor):
    """
    生産計画の完成品の入庫倉庫を倉庫マスターへの外部キーにする前に、空文字を未設定(NULL)にそろえ、
    倉庫マスターに無い倉庫が入っていれば内容を示して止める(完了の取消で使う計上先のため勝手に消さない)。
    """
    ProductionPlan = apps.get_model("production", "ProductionPlan")
    Warehouse = apps.get_model("master", "Warehouse")
    ProductionPlan.objects.filter(finished_goods_warehouse="").update(finished_goods_warehouse=None)
    known = set(Warehouse.objects.values_list("warehouse_number", flat=True))
    invalid = [
        f"{name} ({pk}): {warehouse}"
        for pk, name, warehouse in ProductionPlan.objects.exclude(finished_goods_warehouse__isnull=True).values_list(
            "pk", "plan_name", "finished_goods_warehouse"
        )
        if warehouse not in known
    ]
    if invalid:
        raise RuntimeError(
            "生産計画の完成品の入庫倉庫に、倉庫マスターに無い倉庫が入っているため移行できません。"
            "倉庫マスターに登録してから再実行してください。\n" + "\n".join(invalid[:50])
        )


class Migration(migrations.Migration):
    dependencies = [
        ("production", "0016_production_plan_finished_goods_destination"),
        ("master", "0017_item_default_warehouse_fk"),
    ]

    operations = [
        migrations.RunPython(check_and_normalize, migrations.RunPython.noop),
        # 列名(finished_goods_warehouse)はそのままにして、項目を外部キー(finished_goods_warehouse_rel)に置き換える
        migrations.AlterField(
            model_name="productionplan",
            name="finished_goods_warehouse",
            field=models.CharField(
                blank=True,
                db_column="finished_goods_warehouse",
                max_length=255,
                null=True,
                verbose_name="完成品の入庫倉庫",
            ),
        ),
        migrations.RenameField(
            model_name="productionplan", old_name="finished_goods_warehouse", new_name="finished_goods_warehouse_rel"
        ),
        migrations.AlterField(
            model_name="productionplan",
            name="finished_goods_warehouse_rel",
            field=models.ForeignKey(
                blank=True,
                db_column="finished_goods_warehouse",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="finished_goods_plans",
                to="master.warehouse",
                to_field="warehouse_number",
                verbose_name="完成品の入庫倉庫",
            ),
        ),
    ]
