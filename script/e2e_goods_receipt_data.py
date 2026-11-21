# フロントエンドE2E(画面機能確認: 入庫画面)用のテストデータを投入・削除するスクリプト。
# 手順は docs/09_test_specifications/11_frontend_e2e_functional.md を参照。
#
# backend コンテナの manage.py shell に標準入力で渡して実行する。
#
#   投入(マスタのみ。入庫予定はテスト自身がAPI経由で作成する):
#     docker compose exec -T backend python manage.py shell < script/e2e_goods_receipt_data.py
#
#   削除(テストが作成した入庫予定・入庫実績・在庫・入出庫履歴とマスタをまとめて削除):
#     docker compose exec -T -e E2E_DATA_ACTION=cleanup backend python manage.py shell < script/e2e_goods_receipt_data.py
#
# 対象は下記の E2E 専用コード/接頭辞を持つデータのみで、既存の業務データには触れない。
import os

from django.db import transaction

from inventory.models import Inventory, PurchaseOrder, Receipt, SalesOrder, StockMovement
from master.models import BillOfMaterial, Item, StockPurpose, Supplier, Warehouse
from production.models import ProductionPlan

ITEM_CODE = "E2E-GR-ITEM"
# デフォルト入庫棚番の登録確認(FE-GR-16〜18 / FE-GRM-06〜08)用の品番。テスト自身がAPIで作成するため seed では投入せず、cleanup でのみ削除する
DEFAULT_LOCATION_ITEM_CODES = ("E2E-GR-DEF-PC", "E2E-GR-DEF-MB")
WAREHOUSE_NUMBER = "E2E-WH"
SUPPLIER_NUMBER = "E2E-SUP"
# 出庫処置画面のE2E(goods-issue.spec.ts)で用途(車種)として使うマスタ
PURPOSE_CODE = "E2E-CAR"
# goods-issue.spec.ts が作成する出庫予定の受注番号接頭辞
SALES_ORDER_PREFIX = "E2E-GX-"
# frontend/e2e/goods-receipt*.spec.ts, inventory-lists.spec.ts が作成する入庫予定の発注番号接頭辞
ORDER_NUMBER_PREFIXES = ("E2E-GR-", "E2E-GM-", "E2E-GI-")
# 生産計画の統合(production-plan-merge.spec.ts)用の製品・部品。部品は E2E-WH に在庫を持たせる
MERGE_PRODUCT_CODE = "E2E-PM-PROD"
MERGE_MATERIAL_CODE = "E2E-PM-MAT"


def seed():
    Item.objects.get_or_create(
        code=ITEM_CODE,
        # 入庫時の「デフォルト入庫棚番の登録確認」が出ないよう、デフォルト入庫棚番を登録済みにしておく
        defaults={"name": "E2E入庫テスト品", "item_type": "material", "unit": "個", "default_location": "E2E-LOC"},
    )
    Warehouse.objects.get_or_create(warehouse_number=WAREHOUSE_NUMBER, defaults={"name": "E2Eテスト倉庫"})
    Supplier.objects.get_or_create(supplier_number=SUPPLIER_NUMBER, defaults={"name": "E2Eテスト仕入先"})
    StockPurpose.objects.get_or_create(code=PURPOSE_CODE, defaults={"name": "E2Eテスト車種"})
    product, _ = Item.objects.get_or_create(
        code=MERGE_PRODUCT_CODE, defaults={"name": "E2E統合テスト製品", "item_type": "product", "unit": "個"}
    )
    material, _ = Item.objects.get_or_create(
        code=MERGE_MATERIAL_CODE, defaults={"name": "E2E統合テスト部品", "item_type": "material", "unit": "個"}
    )
    BillOfMaterial.objects.get_or_create(product=product, material=material, defaults={"quantity": 1})
    Inventory.objects.get_or_create(
        part_number_rel_id=MERGE_MATERIAL_CODE,
        warehouse_rel_id=WAREHOUSE_NUMBER,
        location="E2E-LOC",
        defaults={"quantity": 100000, "reserved": 0},
    )
    print(f"seed: item={ITEM_CODE} warehouse={WAREHOUSE_NUMBER} supplier={SUPPLIER_NUMBER}")


def cleanup():
    ITEM_CODES = (ITEM_CODE, *DEFAULT_LOCATION_ITEM_CODES)
    with transaction.atomic():
        orders = PurchaseOrder.objects.none()
        for prefix in ORDER_NUMBER_PREFIXES:
            orders = orders | PurchaseOrder.objects.filter(order_number__startswith=prefix)
        # 部品に加え、生産完了で計上された完成品(製品)の在庫・入出庫履歴も対象にする
        merge_materials = (MERGE_MATERIAL_CODE, MERGE_PRODUCT_CODE)
        counts = {
            "production_plans": ProductionPlan.objects.filter(product_id=MERGE_PRODUCT_CODE).delete()[0],
            "merge_sales_orders": SalesOrder.objects.filter(item_rel_id__in=merge_materials).delete()[0],
            "merge_stock_movements": StockMovement.objects.filter(part_number_rel_id__in=merge_materials).delete()[0],
            "merge_inventories": Inventory.objects.filter(part_number_rel_id__in=merge_materials).delete()[0],
            "merge_bom": BillOfMaterial.objects.filter(product_id=MERGE_PRODUCT_CODE).delete()[0],
            "merge_items": Item.objects.filter(code__in=(MERGE_PRODUCT_CODE, MERGE_MATERIAL_CODE)).delete()[0],
            "sales_orders": SalesOrder.objects.filter(order_number__startswith=SALES_ORDER_PREFIX).delete()[0],
            "receipts": Receipt.objects.filter(purchase_order__in=orders).delete()[0],
            "purchase_orders": orders.delete()[0],
            "stock_movements": StockMovement.objects.filter(part_number_rel_id__in=ITEM_CODES).delete()[0],
            "inventories": Inventory.objects.filter(part_number_rel_id__in=ITEM_CODES).delete()[0],
            "purposes": StockPurpose.objects.filter(code=PURPOSE_CODE).delete()[0],
            "items": Item.objects.filter(code__in=ITEM_CODES).delete()[0],
            "warehouses": Warehouse.objects.filter(warehouse_number=WAREHOUSE_NUMBER).delete()[0],
            "suppliers": Supplier.objects.filter(supplier_number=SUPPLIER_NUMBER).delete()[0],
        }
    print(f"cleanup: {counts}")


if os.environ.get("E2E_DATA_ACTION", "seed") == "cleanup":
    cleanup()
else:
    seed()
