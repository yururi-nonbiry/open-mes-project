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

from inventory.models import Inventory, PurchaseOrder, Receipt, StockMovement
from master.models import Item, Supplier, Warehouse

ITEM_CODE = "E2E-GR-ITEM"
WAREHOUSE_NUMBER = "E2E-WH"
SUPPLIER_NUMBER = "E2E-SUP"
# frontend/e2e/goods-receipt*.spec.ts, inventory-lists.spec.ts が作成する入庫予定の発注番号接頭辞
ORDER_NUMBER_PREFIXES = ("E2E-GR-", "E2E-GM-", "E2E-GI-")


def seed():
    Item.objects.get_or_create(
        code=ITEM_CODE, defaults={"name": "E2E入庫テスト品", "item_type": "material", "unit": "個"}
    )
    Warehouse.objects.get_or_create(warehouse_number=WAREHOUSE_NUMBER, defaults={"name": "E2Eテスト倉庫"})
    Supplier.objects.get_or_create(supplier_number=SUPPLIER_NUMBER, defaults={"name": "E2Eテスト仕入先"})
    print(f"seed: item={ITEM_CODE} warehouse={WAREHOUSE_NUMBER} supplier={SUPPLIER_NUMBER}")


def cleanup():
    with transaction.atomic():
        orders = PurchaseOrder.objects.none()
        for prefix in ORDER_NUMBER_PREFIXES:
            orders = orders | PurchaseOrder.objects.filter(order_number__startswith=prefix)
        counts = {
            "receipts": Receipt.objects.filter(purchase_order__in=orders).delete()[0],
            "purchase_orders": orders.delete()[0],
            "stock_movements": StockMovement.objects.filter(part_number_rel_id=ITEM_CODE).delete()[0],
            "inventories": Inventory.objects.filter(part_number_rel_id=ITEM_CODE).delete()[0],
            "items": Item.objects.filter(code=ITEM_CODE).delete()[0],
            "warehouses": Warehouse.objects.filter(warehouse_number=WAREHOUSE_NUMBER).delete()[0],
            "suppliers": Supplier.objects.filter(supplier_number=SUPPLIER_NUMBER).delete()[0],
        }
    print(f"cleanup: {counts}")


if os.environ.get("E2E_DATA_ACTION", "seed") == "cleanup":
    cleanup()
else:
    seed()
