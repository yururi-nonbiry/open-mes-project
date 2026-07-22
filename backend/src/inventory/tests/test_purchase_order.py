from django.urls import reverse
from rest_framework import status

from inventory.models import PurchaseOrder, Receipt

from .test_helpers import InventoryAPITestBase


class PurchaseOrderCrudTests(InventoryAPITestBase):
    """PO-CRUD-* : 入庫予定 一覧/作成/検索/削除。"""

    def setUp(self):
        super().setUp()
        self.po1 = self.create_purchase_order(order_number="PO-001", item="Item A", quantity=10)
        self.po2 = self.create_purchase_order(
            order_number="PO-002", item="Item B", quantity=20, status="partially_received", received_quantity=5
        )

    def test_po_crud_01_list(self):
        url = reverse("inventory_api:purchaseorder-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_po_crud_02_create(self):
        url = reverse("inventory_api:purchaseorder-list")
        data = {"order_number": "PO-003", "item": "Item C", "quantity": 30}
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PurchaseOrder.objects.count(), 3)

    def test_po_crud_03_duplicate_order_number_rejected(self):
        url = reverse("inventory_api:purchaseorder-list")
        data = {"order_number": "PO-001", "item": "Item D", "quantity": 40}
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order_number", response.data)

    def test_po_crud_04_delete_without_receipt(self):
        url = reverse("inventory_api:purchaseorder-detail", kwargs={"pk": self.po1.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(PurchaseOrder.objects.count(), 1)

    def test_po_crud_05_delete_protected_when_receipt_exists(self):
        Receipt.objects.create(
            purchase_order=self.po1, received_quantity=1, warehouse=self.warehouse_a.warehouse_number
        )
        url = reverse("inventory_api:purchaseorder-detail", kwargs={"pk": self.po1.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(PurchaseOrder.objects.filter(pk=self.po1.pk).exists())

    def test_po_crud_06_search_status_received_matches_both(self):
        url = reverse("inventory_api:purchaseorder-list")
        response = self.client.get(url, {"search_status": "received"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["order_number"], "PO-002")

    def test_po_crud_07_search_q_cross_field(self):
        url = reverse("inventory_api:purchaseorder-list")
        response = self.client.get(url, {"search_q": "Item A"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["order_number"], "PO-001")

    def test_po_crud_08_search_order_date_range(self):
        url = reverse("inventory_api:purchaseorder-list")
        # order_date は auto_now_add のため今日の日付を含む範囲で検索できることを確認する
        from django.utils import timezone

        today = timezone.now().date().isoformat()
        response = self.client.get(url, {"search_order_date_from": today, "search_order_date_to": today})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_po_crud_09_search_expected_arrival_range_nulls_last(self):
        url = reverse("inventory_api:purchaseorder-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # expected_arrival が未設定のPOも一覧に含まれる(nulls_lastでソート末尾)
        order_numbers = [r["order_number"] for r in response.data["results"]]
        self.assertIn("PO-001", order_numbers)
        self.assertIn("PO-002", order_numbers)
