from django.urls import reverse
from rest_framework import status

from .test_helpers import InventoryAPITestBase


class InventoryByLocationTests(InventoryAPITestBase):
    """INV-BYL-* : 棚番指定取得アクション (GET inventories/by-location/)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("inventory_api:inventory-by-location")

    def test_inv_byl_01_success(self):
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=5)
        response = self.client.get(self.url, {"warehouse": "WH-A", "location": "A-01"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_inv_byl_02_missing_warehouse(self):
        response = self.client.get(self.url, {"location": "A-01"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inv_byl_03_empty_location_string_allowed(self):
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="", quantity=5)
        response = self.client.get(self.url, {"warehouse": "WH-A", "location": ""})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_inv_byl_04_zero_quantity_excluded(self):
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=0)
        response = self.client.get(self.url, {"warehouse": "WH-A", "location": "A-01"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)
