from django.urls import reverse
from rest_framework import status

from .test_helpers import InventoryAPITestBase


class DistinctValuesTests(InventoryAPITestBase):
    """PO-DIST-* : 発注フィールド一覧取得アクション (GET purchase-orders/distinct-values/)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("inventory_api:purchaseorder-distinct-values")
        self.create_purchase_order(order_number="PO-201", quantity=1)
        self.create_purchase_order(order_number="PO-202", quantity=1, item="")

    def test_po_dist_01_charfield_returns_sorted_unique_values(self):
        response = self.client.get(self.url, {"field": "order_number"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, sorted(response.data))
        self.assertIn("PO-201", response.data)
        self.assertNotIn("", response.data)

    def test_po_dist_02_missing_field(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_dist_03_non_charfield_rejected(self):
        response = self.client.get(self.url, {"field": "quantity"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_dist_04_unknown_field_rejected(self):
        response = self.client.get(self.url, {"field": "nonexistent_field"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
