from django.urls import reverse
from rest_framework import status

from inventory.models import StockMovement

from .test_helpers import InventoryAPITestBase


class InventoryAdjustTests(InventoryAPITestBase):
    """INV-ADJ-* : 在庫調整アクション (POST inventories/{id}/adjust/)。"""

    def setUp(self):
        super().setUp()
        self.inventory = self.create_inventory(quantity=10, reserved=2)
        self.url = reverse("inventory_api:inventory-adjust", kwargs={"pk": self.inventory.id})

    def test_inv_adj_01_increase(self):
        response = self.client.post(self.url, {"quantity": 15}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 15)
        movement = StockMovement.objects.get(movement_type="incoming", quantity=5)
        self.assertEqual(movement.description, "在庫調整: 10 -> 15")

    def test_inv_adj_02_decrease(self):
        response = self.client.post(self.url, {"quantity": 7}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 7)
        self.assertTrue(StockMovement.objects.filter(movement_type="outgoing", quantity=3).exists())

    def test_inv_adj_03_no_change_no_movement(self):
        response = self.client.post(self.url, {"quantity": 10}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_inv_adj_04_below_reserved_rejected(self):
        response = self.client.post(self.url, {"quantity": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)

    def test_inv_adj_05_missing_quantity(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inv_adj_06_non_numeric_quantity(self):
        response = self.client.post(self.url, {"quantity": "abc"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inv_adj_07_location_updated_when_provided(self):
        response = self.client.post(self.url, {"quantity": 10, "location": "A-02"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.location, "A-02")

    def test_inv_adj_07b_location_unchanged_when_omitted(self):
        response = self.client.post(self.url, {"quantity": 12}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.location, "A-01")
