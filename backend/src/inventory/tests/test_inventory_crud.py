from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status

from .test_helpers import InventoryAPITestBase


class InventoryCrudTests(InventoryAPITestBase):
    """INV-CRUD-* : 在庫 一覧/詳細取得・検索・一意制約・read_only_fields。"""

    def setUp(self):
        super().setUp()
        self.inventory1 = self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=100
        )
        self.inventory2 = self.create_inventory(
            part_number=self.item2.code, warehouse=self.warehouse_b.warehouse_number, location="B-01", quantity=50
        )

    def test_inv_crud_01_list(self):
        url = reverse("inventory_api:inventory-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_inv_crud_02_retrieve(self):
        url = reverse("inventory_api:inventory-detail", kwargs={"pk": self.inventory1.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["quantity"], 100)

    def test_inv_crud_03_filter_by_part_number(self):
        url = reverse("inventory_api:inventory-list")
        response = self.client.get(url, {"part_number_query": "PART-001"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["part_number"], "PART-001")

    def test_inv_crud_04_filter_by_warehouse(self):
        url = reverse("inventory_api:inventory-list")
        response = self.client.get(url, {"warehouse_query": "WH-B"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["warehouse"], "WH-B")

    def test_inv_crud_05_filter_by_location(self):
        url = reverse("inventory_api:inventory-list")
        response = self.client.get(url, {"location_query": "A-01"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["location"], "A-01")

    def test_inv_crud_06_hide_zero_stock(self):
        # quantity <= reserved の在庫は hide_zero_stock_query=true で除外される
        self.inventory1.reserved = 100
        self.inventory1.save()
        url = reverse("inventory_api:inventory-list")
        response = self.client.get(url, {"hide_zero_stock_query": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.inventory2.id))

    def test_inv_crud_07_duplicate_unique_constraint(self):
        with self.assertRaises(IntegrityError):
            self.create_inventory(
                part_number=self.item1.code,
                warehouse=self.warehouse_a.warehouse_number,
                location="A-01",
                quantity=1,
            )

    def test_inv_crud_08_patch_quantity_reserved_ignored(self):
        url = reverse("inventory_api:inventory-detail", kwargs={"pk": self.inventory1.id})
        response = self.client.patch(url, {"quantity": 9999, "reserved": 500}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory1.refresh_from_db()
        self.assertEqual(self.inventory1.quantity, 100)
        self.assertEqual(self.inventory1.reserved, 0)

    def test_inv_crud_09_available_quantity_zero_when_inactive(self):
        self.inventory1.is_active = False
        self.inventory1.save()
        url = reverse("inventory_api:inventory-detail", kwargs={"pk": self.inventory1.id})
        response = self.client.get(url)
        self.assertEqual(response.data["available_quantity"], 0)

    def test_inv_crud_09b_available_quantity_zero_when_not_allocatable(self):
        self.inventory1.is_allocatable = False
        self.inventory1.save()
        self.assertEqual(self.inventory1.available_quantity, 0)
