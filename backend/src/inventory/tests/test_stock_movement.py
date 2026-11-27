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

        today = timezone.localdate().isoformat()
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

    def test_sm_list_04_search_location(self):
        StockMovement.objects.create(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number,
            movement_type="incoming", quantity=1, location="A-01-02",
        )
        url = reverse("inventory_api:stockmovement-list")
        response = self.client.get(url, {"search_location": "a-01"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)


class InvalidDateParamTests(InventoryAPITestBase):
    """INV-DATE-* : 一覧の日付の絞り込みに不正な値を渡しても500にせず400で返す。"""

    def test_inv_date_01_invalid_date_returns_400(self):
        from django.urls import reverse

        for name, param in (
            ("inventory_api:stockmovement-list", "search_movement_date_from"),
            ("inventory_api:purchaseorder-list", "search_expected_arrival_from"),
            ("inventory_api:salesorder-list", "search_expected_shipment_to"),
        ):
            response = self.client.get(reverse(name), {param: "abc"})
            self.assertEqual(response.status_code, 400, (name, response.content))
            response = self.client.get(reverse(name), {param: "2026-01-31"})
            self.assertEqual(response.status_code, 200, name)
