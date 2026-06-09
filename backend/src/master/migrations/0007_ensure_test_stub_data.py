from django.db import migrations

def create_stubs(apps, schema_editor):
    Item = apps.get_model("master", "Item")
    Warehouse = apps.get_model("master", "Warehouse")

    # Ensure items exist
    Item.objects.get_or_create(
        code="TEST-PROD-001",
        defaults={
            "name": "テスト製品001",
            "item_type": "product",
            "unit": "個",
            "provision_type": "none",
        }
    )
    Item.objects.get_or_create(
        code="TEST-PART-001",
        defaults={
            "name": "テスト材料001",
            "item_type": "material",
            "unit": "個",
            "provision_type": "none",
        }
    )

    # Ensure warehouses exist
    Warehouse.objects.get_or_create(
        warehouse_number="WH-001",
        defaults={
            "name": "テスト倉庫001",
        }
    )
    Warehouse.objects.get_or_create(
        warehouse_number="FG-MAIN",
        defaults={
            "name": "完成品主倉庫",
        }
    )

def remove_stubs(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    dependencies = [
        ("master", "0006_alter_item_provision_type"),
    ]

    operations = [
        migrations.RunPython(create_stubs, remove_stubs),
    ]
