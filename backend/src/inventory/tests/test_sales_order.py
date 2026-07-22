from django.urls import reverse
from rest_framework import status

from .test_helpers import InventoryAPITestBase


class SalesOrderCrudTests(InventoryAPITestBase):
    """SO-CRUD-* : 出庫予定 一覧/検索。"""

    def setUp(self):
        super().setUp()
        self.so1 = self.create_sales_order(
            order_number="SO-001", item=self.item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=10
        )
        self.so2 = self.create_sales_order(
            order_number="SO-002", item=self.item2.code, warehouse=self.warehouse_b.warehouse_number,
            quantity=5, status="shipped", shipped_quantity=5,
        )

    def test_so_crud_01_list(self):
        url = reverse("inventory_api:salesorder-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_so_crud_02_search_order_number(self):
        url = reverse("inventory_api:salesorder-list")
        response = self.client.get(url, {"search_order_number": "SO-001"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_so_crud_03_search_item(self):
        url = reverse("inventory_api:salesorder-list")
        response = self.client.get(url, {"search_item": self.item2.code})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["order_number"], "SO-002")

    def test_so_crud_04_search_warehouse(self):
        url = reverse("inventory_api:salesorder-list")
        response = self.client.get(url, {"search_warehouse": "WH-A"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_so_crud_05_search_status_exact_match(self):
        url = reverse("inventory_api:salesorder-list")
        response = self.client.get(url, {"search_status": "shipped"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["order_number"], "SO-002")
