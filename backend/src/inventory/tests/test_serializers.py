from django.urls import reverse
from rest_framework import status

from .test_helpers import InventoryAPITestBase


class SerializerReadOnlyFieldsTests(InventoryAPITestBase):
    """SER-* : シリアライザの read_only_fields 挙動確認。"""

    def test_ser_01_inventory_quantity_reserved_readonly(self):
        inventory = self.create_inventory(quantity=10, reserved=1)
        url = reverse("inventory_api:inventory-detail", kwargs={"pk": inventory.id})
        response = self.client.patch(url, {"quantity": 500, "reserved": 500}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory.refresh_from_db()
        self.assertEqual(inventory.quantity, 10)
        self.assertEqual(inventory.reserved, 1)
        self.assertIn("available_quantity", response.data)

    def test_ser_02_purchase_order_status_and_received_quantity_readonly(self):
        po = self.create_purchase_order(
            order_number="PO-SER-1", quantity=10, received_quantity=3, status="partially_received"
        )
        url = reverse("inventory_api:purchaseorder-detail", kwargs={"pk": po.id})
        response = self.client.patch(
            url, {"status": "fully_received", "received_quantity": 999}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, "partially_received")
        self.assertEqual(po.received_quantity, 3)

    def test_ser_03_sales_order_status_and_shipped_quantity_readonly(self):
        so = self.create_sales_order(order_number="SO-SER-1", quantity=10, shipped_quantity=2)
        url = reverse("inventory_api:salesorder-detail", kwargs={"pk": so.id})
        response = self.client.patch(url, {"status": "shipped", "shipped_quantity": 999}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        so.refresh_from_db()
        self.assertEqual(so.status, "pending")
        self.assertEqual(so.shipped_quantity, 2)

    def test_ser_05_reserved_inventory_key_fields_cannot_change(self):
        """引当済みの在庫は、品番・倉庫・用途・棚番を直接変更できない(引当を解放できなくなるため)。"""
        inventory = self.create_inventory(quantity=10, reserved=3)
        url = reverse("inventory_api:inventory-detail", kwargs={"pk": inventory.id})
        response = self.client.patch(url, {"location": "NEW-LOC"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        inventory.refresh_from_db()
        self.assertNotEqual(inventory.location, "NEW-LOC")

    def test_ser_06_shipped_sales_order_quantity_cannot_change(self):
        order = self.create_sales_order(quantity=5, shipped_quantity=5, status="shipped")
        url = reverse("inventory_api:salesorder-detail", kwargs={"pk": order.id})
        response = self.client.patch(url, {"quantity": 50}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
