from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import BillOfMaterial, Customer, Item, Supplier, UnitCost, Warehouse, WarehouseLocation, WorkCenter

User = get_user_model()


class MasterAPITestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.client.force_authenticate(user=self.user)

    def create_item(self, **kwargs):
        defaults = {
            "name": "テスト品目",
            "code": "ITEM-001",
            "item_type": "material",
        }
        defaults.update(kwargs)
        return Item.objects.create(**defaults)

    def create_supplier(self, **kwargs):
        defaults = {
            "supplier_number": "SUP-001",
            "name": "テストサプライヤー",
        }
        defaults.update(kwargs)
        return Supplier.objects.create(**defaults)

    def create_warehouse(self, **kwargs):
        defaults = {
            "warehouse_number": "WH-A",
            "name": "テスト倉庫",
        }
        defaults.update(kwargs)
        return Warehouse.objects.create(**defaults)

    def create_warehouse_location(self, warehouse=None, **kwargs):
        defaults = {
            "warehouse": warehouse or self.create_warehouse(),
            "code": "A-01",
            "pos_x": 0,
            "pos_y": 0,
        }
        defaults.update(kwargs)
        return WarehouseLocation.objects.create(**defaults)

    def create_customer(self, **kwargs):
        defaults = {
            "code": "CUST-001",
            "name": "テスト顧客",
        }
        defaults.update(kwargs)
        return Customer.objects.create(**defaults)

    def create_work_center(self, **kwargs):
        defaults = {
            "code": "WC-001",
            "name": "テストワークセンター",
        }
        defaults.update(kwargs)
        return WorkCenter.objects.create(**defaults)

    def create_unit_cost(self, item=None, **kwargs):
        defaults = {
            "item": item or self.create_item(),
            "cost": "100.00",
        }
        defaults.update(kwargs)
        return UnitCost.objects.create(**defaults)

    def create_bill_of_material(self, product=None, material=None, **kwargs):
        defaults = {
            "product": product or self.create_item(code="PROD-001", item_type="product", name="テスト製品"),
            "material": material or self.create_item(code="MAT-001", item_type="material", name="テスト部品"),
            "quantity": "2.000",
        }
        defaults.update(kwargs)
        return BillOfMaterial.objects.create(**defaults)
