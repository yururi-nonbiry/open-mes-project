"""inventory アプリの自動テスト共通ヘルパー。

各テストケースは docs/09_test_specifications/01_inventory.md のケースIDと対応させて
docstring 内に記載している（例: "INV-MOVE-01"）。レポート生成スクリプトはこのdocstringを
そのまま利用するため、ケースを追加・変更する際はテスト仕様書側も合わせて更新すること。
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from inventory.models import Inventory, PurchaseOrder, SalesOrder
from master.models import Item, Warehouse, WarehouseLocation

User = get_user_model()


class InventoryAPITestBase(APITestCase):
    """認証済みユーザーと基本マスタデータ(品目・倉庫)を用意する共通基底クラス。"""

    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.client.force_authenticate(user=self.user)

        self.item1 = Item.objects.create(code="PART-001", name="Part 1", item_type="material")
        self.item2 = Item.objects.create(code="PART-002", name="Part 2", item_type="material")
        self.warehouse_a = Warehouse.objects.create(warehouse_number="WH-A", name="Warehouse A")
        self.warehouse_b = Warehouse.objects.create(warehouse_number="WH-B", name="Warehouse B")

    def create_inventory(self, **kwargs):
        defaults = {
            "part_number": self.item1.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "location": "A-01",
            "quantity": 0,
            "reserved": 0,
        }
        defaults.update(kwargs)
        return Inventory.objects.create(**defaults)

    def create_purchase_order(self, **kwargs):
        defaults = {
            "order_number": "PO-TEST-001",
            "part_number": self.item1.code,
            "quantity": 10,
        }
        defaults.update(kwargs)
        return PurchaseOrder.objects.create(**defaults)

    def create_warehouse_location(self, warehouse, code, **kwargs):
        defaults = {"pos_x": 0, "pos_y": 0}
        defaults.update(kwargs)
        return WarehouseLocation.objects.create(warehouse=warehouse, code=code, **defaults)

    def create_sales_order(self, **kwargs):
        defaults = {
            "order_number": "SO-TEST-001",
            "item": self.item1.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "quantity": 10,
        }
        defaults.update(kwargs)
        return SalesOrder.objects.create(**defaults)
