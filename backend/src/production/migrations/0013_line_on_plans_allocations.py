import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('master', '0014_stock_purpose'),
        ('production', '0012_purpose_on_orders_plans'),
    ]

    operations = [
        migrations.AddField(
            model_name='materialallocation',
            name='line_rel',
            field=models.ForeignKey(blank=True, db_column='line', null=True, on_delete=django.db.models.deletion.PROTECT, to='master.workcenter', to_field='code', verbose_name='ライン'),
        ),
        migrations.AddField(
            model_name='productionplan',
            name='line_rel',
            field=models.ForeignKey(blank=True, db_column='line', null=True, on_delete=django.db.models.deletion.PROTECT, to='master.workcenter', to_field='code', verbose_name='ライン'),
        ),
    ]
