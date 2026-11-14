from django.db import migrations

# (CSVヘッダー, モデルフィールド名, 上書きキーか)。並び順がテンプレートCSVの列順になる。
# 外部キー(品番など)は <フィールド名>_id でコードを直接指定する。
DEFAULT_MAPPINGS = {
    "item": [
        ("品番", "code", True),
        ("品名", "name", False),
        ("品目タイプ", "item_type", False),
        ("説明", "description", False),
        ("単位", "unit", False),
        ("デフォルト入庫倉庫", "default_warehouse", False),
        ("デフォルト入庫棚番", "default_location", False),
        ("支給種別", "provision_type", False),
        ("リードタイム(日)", "lead_time_days", False),
    ],
    "supplier": [
        ("サプライヤー番号", "supplier_number", True),
        ("サプライヤー名", "name", False),
        ("担当者名", "contact_person", False),
        ("電話番号", "phone", False),
        ("メールアドレス", "email", False),
        ("住所", "address", False),
    ],
    "warehouse": [
        ("倉庫番号", "warehouse_number", True),
        ("倉庫名", "name", False),
        ("場所", "location", False),
    ],
    "customer": [
        ("顧客コード", "code", True),
        ("顧客名", "name", False),
    ],
    "work_center": [
        ("ワークセンターコード", "code", True),
        ("ワークセンター名", "name", False),
    ],
    "unit_cost": [
        ("品番", "item_id", True),
        ("標準単価", "cost", False),
    ],
    "production_plan": [
        ("計画名", "plan_name", True),
        ("製品品番", "product_id", False),
        ("用途コード", "purpose", False),
        ("ライン", "line", False),
        ("参照生産計画", "production_plan", False),
        ("計画数量", "planned_quantity", False),
        ("計画開始日時", "planned_start_datetime", False),
        ("計画終了日時", "planned_end_datetime", False),
        ("備考", "remarks", False),
    ],
}


def seed_default_mappings(apps, schema_editor):
    CsvColumnMapping = apps.get_model("base", "CsvColumnMapping")
    for data_type, columns in DEFAULT_MAPPINGS.items():
        # 利用者が既に設定している種別は上書きしない
        if CsvColumnMapping.objects.filter(data_type=data_type).exists():
            continue
        CsvColumnMapping.objects.bulk_create(
            [
                CsvColumnMapping(
                    data_type=data_type,
                    csv_header=header,
                    model_field_name=field,
                    order=index,
                    is_update_key=is_key,
                    is_active=True,
                )
                for index, (header, field, is_key) in enumerate(columns, start=1)
            ]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0016_qrcodeaction_update_search_action"),
    ]

    operations = [
        # 逆方向は利用者が編集した設定を消しかねないため何もしない
        migrations.RunPython(seed_default_mappings, migrations.RunPython.noop),
    ]
