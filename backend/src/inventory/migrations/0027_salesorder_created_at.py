import django.utils.timezone
from django.db import migrations, models
from django.db.models import F


def copy_order_date(apps, schema_editor):
    """既存の出庫予定は、受注日がこれまで投入日時だったので、投入日時へ引き継ぐ。"""
    apps.get_model("inventory", "SalesOrder").objects.update(created_at=F("order_date"))


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0026_line_on_orders_movements"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesorder",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now, verbose_name="投入日時"),
            preserve_default=False,
        ),
        migrations.RunPython(copy_order_date, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="salesorder",
            name="order_date",
            field=models.DateTimeField(default=django.utils.timezone.now, verbose_name="受注日"),
        ),
    ]
