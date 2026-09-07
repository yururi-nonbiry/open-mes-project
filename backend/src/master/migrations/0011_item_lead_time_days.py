from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("master", "0010_billofmaterial"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="lead_time_days",
            field=models.PositiveIntegerField(default=0, verbose_name="調達リードタイム（日）"),
        ),
    ]
