import uuid

from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory, PurchaseOrder, Receipt, StockMovement

from .test_helpers import InventoryAPITestBase


class ProcessReceiptTests(InventoryAPITestBase):
    """PO-RECV-* : 入庫処理アクション (POST purchase-orders/process-receipt/)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("inventory_api:purchaseorder-process-receipt")
        self.po = self.create_purchase_order(order_number="PO-100", quantity=10)

    def test_po_recv_01_full_receipt_new_inventory(self):
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 10,
                "warehouse": self.warehouse_a.warehouse_number,
                "location": "A-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.po.refresh_from_db()
        self.assertEqual(self.po.received_quantity, 10)
        self.assertEqual(self.po.status, "fully_received")
        self.assertEqual(Receipt.objects.count(), 1)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_a.warehouse_number, location="A-01"
        )
        self.assertEqual(inventory.quantity, 10)
        self.assertTrue(
            StockMovement.objects.filter(
                movement_type="incoming", reference_document=f"PO: {self.po.order_number}"
            ).exists()
        )

    def test_po_recv_02_partial_receipt(self):
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 6,
                "warehouse": self.warehouse_a.warehouse_number,
                "location": "A-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.po.refresh_from_db()
        self.assertEqual(self.po.received_quantity, 6)
        self.assertEqual(self.po.status, "partially_received")

    def test_po_recv_03_cumulative_receipts_complete_order(self):
        self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 6,
                "warehouse": self.warehouse_a.warehouse_number,
                "location": "A-01",
            },
            format="json",
        )
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 4,
                "warehouse": self.warehouse_a.warehouse_number,
                "location": "A-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.po.refresh_from_db()
        self.assertEqual(self.po.received_quantity, 10)
        self.assertEqual(self.po.status, "fully_received")

    def test_po_recv_04_adds_to_existing_inventory(self):
        self.create_inventory(warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=3)
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 5,
                "warehouse": self.warehouse_a.warehouse_number,
                "location": "A-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_a.warehouse_number, location="A-01"
        )
        self.assertEqual(inventory.quantity, 8)
        self.assertEqual(
            Inventory.objects.filter(
                part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_a.warehouse_number, location="A-01"
            ).count(),
            1,
        )

    def test_po_recv_05_missing_required_fields(self):
        response = self.client.post(self.url, {"purchase_order_id": str(self.po.id)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_recv_06_non_positive_received_quantity(self):
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 0,
                "warehouse": self.warehouse_a.warehouse_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_recv_07_purchase_order_not_found(self):
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(uuid.uuid4()),
                "received_quantity": 1,
                "warehouse": self.warehouse_a.warehouse_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_po_recv_08_missing_part_number_rejected(self):
        po_no_part = PurchaseOrder.objects.create(order_number="PO-101", quantity=5)
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(po_no_part.id),
                "received_quantity": 1,
                "warehouse": self.warehouse_a.warehouse_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_recv_09_exceeding_remaining_quantity_rejected(self):
        response = self.client.post(
            self.url,
            {
                "purchase_order_id": str(self.po.id),
                "received_quantity": 11,
                "warehouse": self.warehouse_a.warehouse_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_recv_10_uses_po_default_warehouse_and_location(self):
        po = self.create_purchase_order(
            order_number="PO-102", quantity=5, warehouse=self.warehouse_b.warehouse_number, location="B-01"
        )
        response = self.client.post(
            self.url, {"purchase_order_id": str(po.id), "received_quantity": 5}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Inventory.objects.filter(
                part_number_rel_id=self.item1.code, warehouse_rel_id=self.warehouse_b.warehouse_number, location="B-01"
            ).exists()
        )

    def test_po_recv_11_no_warehouse_available_rejected(self):
        po_no_wh = self.create_purchase_order(order_number="PO-103", quantity=5)
        response = self.client.post(
            self.url, {"purchase_order_id": str(po_no_wh.id), "received_quantity": 5}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
