from django.urls import reverse
from rest_framework import status

from .test_helpers import InventoryAPITestBase


class LocationMapTests(InventoryAPITestBase):
    """SO-MAP-* : 倉庫レイアウト連携アクション (GET sales-orders/{id}/location-map/)。"""

    def setUp(self):
        super().setUp()
        self.so = self.create_sales_order(
            order_number="SO-500", item=self.item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=10
        )
        self.url = reverse("inventory_api:salesorder-location-map", kwargs={"pk": self.so.id})

    def test_so_map_01_inventory_spread_across_multiple_locations(self):
        self.create_warehouse_location(self.warehouse_a, "A-01", pos_x=0, pos_y=0)
        self.create_warehouse_location(self.warehouse_a, "A-02", pos_x=1, pos_y=0)
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=5)
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=3)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        locations = {loc["code"]: loc for loc in response.data["data"]["locations"]}
        self.assertEqual(locations["A-01"]["quantity"], 5)
        self.assertTrue(locations["A-01"]["highlighted"])
        self.assertEqual(locations["A-02"]["quantity"], 3)
        self.assertTrue(locations["A-02"]["highlighted"])

    def test_so_map_02_location_without_stock_not_highlighted(self):
        self.create_warehouse_location(self.warehouse_a, "A-01", pos_x=0, pos_y=0)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        loc = response.data["data"]["locations"][0]
        self.assertEqual(loc["quantity"], 0)
        self.assertFalse(loc["highlighted"])

    def test_so_map_03_no_locations_registered_returns_empty_list(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["locations"], [])

    def test_so_map_04_fully_reserved_inventory_may_be_non_positive(self):
        # 既知の懸念事項: quantity__gt=0 のみでフィルタするため、全数引当済み在庫も集計対象に入り、
        # reserved控除後の値が0以下になり得る。
        self.create_warehouse_location(self.warehouse_a, "A-01", pos_x=0, pos_y=0)
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=5, reserved=5)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        loc = response.data["data"]["locations"][0]
        self.assertEqual(loc["quantity"], 0)
        self.assertTrue(loc["highlighted"])
