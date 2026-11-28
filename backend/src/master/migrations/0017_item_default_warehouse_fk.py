import django.db.models.deletion
from django.db import migrations, models


def check_and_normalize(apps, schema_editor):
    """
    品番のデフォルト入庫倉庫を倉庫マスターへの外部キーにする前に、空文字を未設定(NULL)にそろえ、
    倉庫マスターに無い倉庫が入っていれば内容を示して止める(勝手に消さない)。
    """
    Item = apps.get_model("master", "Item")
    Warehouse = apps.get_model("master", "Warehouse")
    Item.objects.filter(default_warehouse="").update(default_warehouse=None)
    known = set(Warehouse.objects.values_list("warehouse_number", flat=True))
    invalid = [
        f"{code}: {warehouse}"
        for code, warehouse in Item.objects.exclude(default_warehouse__isnull=True).values_list("code", "default_warehouse")
        if warehouse not in known
    ]
    if invalid:
        raise RuntimeError(
            "品番のデフォルト入庫倉庫に、倉庫マスターに無い倉庫が入っているため移行できません。"
            "倉庫マスターに登録するか、品番の設定を直してから再実行してください。\n" + "\n".join(invalid[:50])
        )


class Migration(migrations.Migration):
    dependencies = [
        ("master", "0016_verbose_names"),
    ]

    operations = [
        migrations.RunPython(check_and_normalize, migrations.RunPython.noop),
        # 列名(default_warehouse)はそのままにして、項目を外部キー(default_warehouse_rel)に置き換える
        migrations.AlterField(
            model_name="item",
            name="default_warehouse",
            field=models.CharField(
                blank=True, db_column="default_warehouse", max_length=255, null=True, verbose_name="デフォルト入庫倉庫"
            ),
        ),
        migrations.RenameField(model_name="item", old_name="default_warehouse", new_name="default_warehouse_rel"),
        migrations.AlterField(
            model_name="item",
            name="default_warehouse_rel",
            field=models.ForeignKey(
                blank=True,
                db_column="default_warehouse",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="default_items",
                to="master.warehouse",
                to_field="warehouse_number",
                verbose_name="デフォルト入庫倉庫",
            ),
        ),
    ]
