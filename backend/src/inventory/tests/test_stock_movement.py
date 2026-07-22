from django.urls import reverse
from rest_framework import status

from inventory.models import StockMovement

from .test_helpers import InventoryAPITestBase


class StockMovementTests(InventoryAPITestBase):
    """SM-LIST-* : 入出庫履歴 参照専用エンドポイント (StockMovementViewSet)。"""

    def setUp(self):
        super().setUp()
        StockMovement.objects.create(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number,
            movement_type="incoming", quantity=10,
        )
        StockMovement.objects.create(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number,
            movement_type="outgoing", quantity=3,
        )

    def test_sm_list_01_list(self):
        url = reverse("inventory_api:stockmovement-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_sm_list_02_multi_value_movement_type_or(self):
        url = reverse("inventory_api:stockmovement-list")
        response = self.client.get(url, {"search_movement_type": ["incoming", "outgoing"]})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_sm_list_03_non_numeric_quantity_filter_ignored(self):
        url = reverse("inventory_api:stockmovement-list")
        response = self.client.get(url, {"search_quantity": "abc"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_sm_list_04_date_range_filter(self):
        from django.utils import timezone

        today = timezone.now().date().isoformat()
        url = reverse("inventory_api:stockmovement-list")
        response = self.client.get(url, {"search_movement_date_from": today, "search_movement_date_to": today})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_sm_list_05_create_not_allowed(self):
        url = reverse("inventory_api:stockmovement-list")
        response = self.client.post(url, {"quantity": 1, "movement_type": "incoming"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_sm_list_06_delete_not_allowed(self):
        movement = StockMovement.objects.first()
        url = reverse("inventory_api:stockmovement-detail", kwargs={"pk": movement.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
