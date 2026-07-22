from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory, StockMovement

from .test_helpers import InventoryAPITestBase


class InventoryMoveTests(InventoryAPITestBase):
    """INV-MOVE-* : 在庫移動アクション (POST inventories/{id}/move/)。"""

    def setUp(self):
        super().setUp()
        self.source = self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-01",
            quantity=10, reserved=2,
        )
        self.url = reverse("inventory_api:inventory-move", kwargs={"pk": self.source.id})

    def test_inv_move_01_success_creates_target(self):
        response = self.client.post(
            self.url,
            {"quantity_to_move": 5, "target_warehouse": self.warehouse_b.warehouse_number, "target_location": "A-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.source.refresh_from_db()
        self.assertEqual(self.source.quantity, 5)
        target = Inventory.objects.get(
            part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_b.warehouse_number, location="A-01"
        )
        self.assertEqual(target.quantity, 5)
        self.assertEqual(
            StockMovement.objects.filter(movement_type="outgoing", quantity=5).count(), 1
        )
        self.assertEqual(
            StockMovement.objects.filter(movement_type="incoming", quantity=5).count(), 1
        )

    def test_inv_move_02_success_merges_into_existing_target(self):
        self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_b.warehouse_number, location="A-01", quantity=3
        )
        response = self.client.post(
            self.url,
            {"quantity_to_move": 5, "target_warehouse": self.warehouse_b.warehouse_number, "target_location": "A-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        target = Inventory.objects.get(
            part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_b.warehouse_number, location="A-01"
        )
        self.assertEqual(target.quantity, 8)
        self.assertEqual(
            Inventory.objects.filter(
                part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_b.warehouse_number, location="A-01"
            ).count(),
            1,
        )

    def test_inv_move_03_rejects_when_exceeding_available(self):
        # available = quantity(10) - reserved(2) = 8
        response = self.client.post(
            self.url,
            {"quantity_to_move": 9, "target_warehouse": self.warehouse_b.warehouse_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.source.refresh_from_db()
        self.assertEqual(self.source.quantity, 10)

    def test_inv_move_04_invalid_quantity_value(self):
        response = self.client.post(
            self.url,
            {"quantity_to_move": "abc", "target_warehouse": self.warehouse_b.warehouse_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inv_move_05_missing_target_warehouse(self):
        response = self.client.post(self.url, {"quantity_to_move": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inv_move_06_non_positive_quantity(self):
        response = self.client.post(
            self.url,
            {"quantity_to_move": 0, "target_warehouse": self.warehouse_b.warehouse_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inv_move_07_target_location_omitted_defaults_blank(self):
        response = self.client.post(
            self.url,
            {"quantity_to_move": 1, "target_warehouse": self.warehouse_b.warehouse_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Inventory.objects.filter(
                part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_b.warehouse_number, location=""
            ).exists()
        )
