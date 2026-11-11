from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory
from master.models import StockPurpose

from .test_helpers import InventoryAPITestBase


class MixedPurposeWarningTests(InventoryAPITestBase):
    """INV-MIX-* : 同じ棚に同一品番で用途の違う在庫を入れようとしたときの警告。"""

    def setUp(self):
        super().setUp()
        StockPurpose.objects.create(code="PRD-A", name="A製品用")
        StockPurpose.objects.create(code="PRD-B", name="B製品用")
        self.wh = self.warehouse_a.warehouse_number

    def _assert_warned(self, response):
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "mixed_purpose")

    def _receive(self, po, **extra):
        payload = {"purchase_order_id": str(po.id), "received_quantity": 5, "warehouse": self.wh, "location": "A-01"}
        payload.update(extra)
        return self.client.post(reverse("inventory_api:purchaseorder-process-receipt"), payload, format="json")

    def test_receipt_warns_then_confirmed(self):
        self.create_inventory(quantity=3, purpose="PRD-B")
        po = self.create_purchase_order(order_number="PO-M1", quantity=10)
        self._assert_warned(self._receive(po, purpose="PRD-A"))
        self.assertEqual(Inventory.objects.count(), 1)  # 何も登録されない
        response = self._receive(po, purpose="PRD-A", confirm_mixed_purpose=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Inventory.objects.count(), 2)

    def test_receipt_generic_vs_purposed_warns(self):
        self.create_inventory(quantity=3)  # 汎用
        po = self.create_purchase_order(order_number="PO-M2", quantity=10)
        self._assert_warned(self._receive(po, purpose="PRD-A"))

    def test_receipt_same_purpose_or_empty_stock_no_warning(self):
        self.create_inventory(quantity=3, purpose="PRD-A")
        self.create_inventory(location="A-02", quantity=0, purpose="PRD-B")  # 在庫0は対象外
        po = self.create_purchase_order(order_number="PO-M3", quantity=20)
        self.assertEqual(self._receive(po, purpose="PRD-A").status_code, status.HTTP_200_OK)
        self.assertEqual(self._receive(po, purpose="PRD-A", location="A-02").status_code, status.HTTP_200_OK)

    def test_receipt_without_location_no_warning(self):
        self.create_inventory(location="", quantity=3, purpose="PRD-B")
        po = self.create_purchase_order(order_number="PO-M4", quantity=10)
        self.assertEqual(self._receive(po, purpose="PRD-A", location="").status_code, status.HTTP_200_OK)

    def test_move_warns_then_confirmed(self):
        source = self.create_inventory(location="B-01", quantity=10, purpose="PRD-A")
        self.create_inventory(location="A-01", quantity=2, purpose="PRD-B")
        url = reverse("inventory_api:inventory-move", kwargs={"pk": source.id})
        payload = {"quantity_to_move": 4, "target_warehouse": self.wh, "target_location": "A-01"}
        self._assert_warned(self.client.post(url, payload, format="json"))
        source.refresh_from_db()
        self.assertEqual(source.quantity, 10)
        response = self.client.post(url, {**payload, "confirm_mixed_purpose": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_adjust_location_change_warns(self):
        inv = self.create_inventory(location="B-01", quantity=10, purpose="PRD-A")
        self.create_inventory(location="A-01", quantity=2, purpose="PRD-B")
        url = reverse("inventory_api:inventory-adjust", kwargs={"pk": inv.id})
        payload = {"quantity": 10, "location": "A-01"}
        self._assert_warned(self.client.post(url, payload, format="json"))
        response = self.client.post(url, {**payload, "confirm_mixed_purpose": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_adjust_quantity_only_no_warning(self):
        inv = self.create_inventory(location="A-01", quantity=10, purpose="PRD-A")
        self.create_inventory(location="A-01", quantity=2, purpose="PRD-B")
        url = reverse("inventory_api:inventory-adjust", kwargs={"pk": inv.id})
        response = self.client.post(url, {"quantity": 8, "location": "A-01"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_change_purpose_warns_when_other_purpose_remains(self):
        inv = self.create_inventory(quantity=10, purpose="PRD-A")
        url = reverse("inventory_api:inventory-change-purpose", kwargs={"pk": inv.id})
        # 一部だけ汎用へ変更 → 棚に PRD-A(5) と汎用(5) が混在
        payload = {"quantity": 5, "purpose": ""}
        self._assert_warned(self.client.post(url, payload, format="json"))
        response = self.client.post(url, {**payload, "confirm_mixed_purpose": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_change_purpose_whole_quantity_no_warning(self):
        inv = self.create_inventory(quantity=10, purpose="PRD-A")
        url = reverse("inventory_api:inventory-change-purpose", kwargs={"pk": inv.id})
        response = self.client.post(url, {"quantity": 10, "purpose": "PRD-B"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
