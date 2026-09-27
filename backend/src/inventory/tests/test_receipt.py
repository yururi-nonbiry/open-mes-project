from django.urls import reverse
from rest_framework import status

from inventory.models import Receipt

from .test_helpers import InventoryAPITestBase


class ReceiptCrudTests(InventoryAPITestBase):
    """RCP-CRUD-* : 入庫実績 標準CRUD (ReceiptViewSet)。"""

    def setUp(self):
        super().setUp()
        self.po = self.create_purchase_order(order_number="PO-300", quantity=10)
        self.receipt = Receipt.objects.create(
            purchase_order=self.po, received_quantity=5, warehouse=self.warehouse_a.warehouse_number
        )

    def test_rcp_crud_01_list(self):
        url = reverse("inventory_api:receipt-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_rcp_crud_02_retrieve_and_update_remarks_only(self):
        """入庫実績は参照と備考の更新のみ可能。作成・削除・数量変更は在庫と整合しなくなるため不可。"""
        detail_url = reverse("inventory_api:receipt-detail", kwargs={"pk": self.receipt.id})
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["received_quantity"], 5)

        list_url = reverse("inventory_api:receipt-list")
        create_response = self.client.post(
            list_url,
            {
                "purchase_order": str(self.po.id),
                "received_quantity": 2,
                "warehouse": self.warehouse_a.warehouse_number,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        update_response = self.client.patch(
            detail_url, {"remarks": "更新済み", "received_quantity": 99}, format="json"
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.data["remarks"], "更新済み")
        self.receipt.refresh_from_db()
        self.assertEqual(self.receipt.received_quantity, 5)

        delete_response = self.client.delete(detail_url)
        self.assertEqual(delete_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Receipt.objects.filter(pk=self.receipt.pk).exists())
