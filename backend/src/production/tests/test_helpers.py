"""production アプリの自動テスト共通ヘルパー。

各テストケースは docs/09_test_specifications/03_production.md のケースIDと対応させて
docstring 内に記載している（例: "PP-ALLOC-01"）。レポート生成スクリプトはこのdocstringを
そのまま利用するため、ケースを追加・変更する際はテスト仕様書側も合わせて更新すること。
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from inventory.models import Inventory
from master.models import Item, Warehouse

from ..models import MaterialAllocation, PartsUsed, ProductionPlan, WorkProgress

User = get_user_model()


class ProductionAPITestBase(APITestCase):
    """認証済みユーザーと基本マスタデータ(品目・倉庫)を用意する共通基底クラス。"""

    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.client.force_authenticate(user=self.user)

        self.product_item = Item.objects.create(code="PROD-001", name="Product 1", item_type="product")
        self.material_item1 = Item.objects.create(code="MAT-001", name="Material 1", item_type="material")
        self.material_item2 = Item.objects.create(code="MAT-002", name="Material 2", item_type="material")
        self.warehouse_a = Warehouse.objects.create(warehouse_number="WH-A", name="Warehouse A")
        # master.migrations.0007_ensure_test_stub_data がテストDBにも "FG-MAIN" を
        # 事前投入するため、create() ではなく get_or_create() で衝突を避ける。
        self.warehouse_fg, _ = Warehouse.objects.get_or_create(
            warehouse_number=settings.DEFAULT_FINISHED_GOODS_WAREHOUSE, defaults={"name": "Finished Goods Warehouse"}
        )

    def create_plan(self, **kwargs):
        now = timezone.now()
        defaults = {
            "plan_name": "Plan 1",
            "product_code": self.product_item.code,
            "planned_quantity": 10,
            "planned_start_datetime": now,
            "planned_end_datetime": now + timezone.timedelta(hours=1),
            "status": "PENDING",
        }
        defaults.update(kwargs)
        return ProductionPlan.objects.create(**defaults)

    def create_parts_used(self, **kwargs):
        defaults = {
            "production_plan": "BOM-1",
            "part_code": self.material_item1.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "quantity_used": 5,
        }
        defaults.update(kwargs)
        return PartsUsed.objects.create(**defaults)

    def create_inventory(self, **kwargs):
        defaults = {
            "part_number": self.material_item1.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "location": "A-01",
            "quantity": 0,
            "reserved": 0,
        }
        defaults.update(kwargs)
        return Inventory.objects.create(**defaults)

    def create_material_allocation(self, **kwargs):
        defaults = {
            "production_plan": None,
            "material_code": self.material_item1.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "allocated_quantity": 5,
            "status": "ALLOCATED",
        }
        defaults.update(kwargs)
        return MaterialAllocation.objects.create(**defaults)

    def create_work_progress(self, **kwargs):
        defaults = {
            "process_step": "Overall Plan Progress",
            "status": "NOT_STARTED",
        }
        defaults.update(kwargs)
        return WorkProgress.objects.create(**defaults)
