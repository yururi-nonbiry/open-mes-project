from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status

from inventory import services
from inventory.models import Inventory, Receipt, StockMovement
from master.models import StockPurpose

from .test_helpers import InventoryAPITestBase


class InventoryPurposeTests(InventoryAPITestBase):
    """INV-PUR-* : 在庫の用途(同一品番・倉庫・棚でも用途別に別行で持てる)。"""

    def setUp(self):
        super().setUp()
        self.purpose_a = StockPurpose.objects.create(code="PRD-A", name="A製品用")
        self.purpose_b = StockPurpose.objects.create(code="PRD-B", name="B製品用")

    def test_inv_pur_01_same_location_different_purposes_coexist(self):
        self.create_inventory(quantity=5)  # 汎用
        self.create_inventory(quantity=5, purpose="PRD-A")
        self.create_inventory(quantity=5, purpose="PRD-B")
        self.assertEqual(Inventory.objects.count(), 3)

    def test_inv_pur_02_duplicate_same_purpose_rejected(self):
        self.create_inventory(purpose="PRD-A")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_inventory(purpose="PRD-A")

    def test_inv_pur_03_duplicate_generic_rejected(self):
        self.create_inventory()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_inventory()

    def test_inv_pur_04_get_or_create_distinguishes_purpose(self):
        generic = services.get_or_create_locked_inventory(self.item1.code, "WH-A", "A-01")
        purposed = services.get_or_create_locked_inventory(self.item1.code, "WH-A", "A-01", purpose="PRD-A")
        again = services.get_or_create_locked_inventory(self.item1.code, "WH-A", "A-01", purpose="PRD-A")
        self.assertNotEqual(generic.pk, purposed.pk)
        self.assertEqual(purposed.pk, again.pk)
        self.assertIsNone(generic.purpose)

    def test_inv_pur_05_api_exposes_purpose(self):
        self.create_inventory(quantity=3, purpose="PRD-A")
        response = self.client.get(reverse("inventory_api:inventory-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["purpose"], "PRD-A")


class ReceiptPurposeTests(InventoryAPITestBase):
    """INV-PUR-1x : 入庫・棚移動・在庫戻しでの用途の扱い。"""

    def setUp(self):
        super().setUp()
        StockPurpose.objects.create(code="PRD-A", name="A製品用")
        StockPurpose.objects.create(code="OLD", name="旧用途", is_active=False)
        self.url = reverse("inventory_api:purchaseorder-process-receipt")

    def _receive(self, po, **extra):
        payload = {
            "purchase_order_id": str(po.id),
            "received_quantity": 5,
            "warehouse": self.warehouse_a.warehouse_number,
            "location": "A-01",
        }
        payload.update(extra)
        return self.client.post(self.url, payload, format="json")

    def test_inv_pur_10_receipt_with_purpose_creates_purposed_inventory(self):
        po = self.create_purchase_order(order_number="PO-P1", quantity=10)
        response = self._receive(po, purpose="PRD-A")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inv = Inventory.objects.get(purpose_rel_id="PRD-A")
        self.assertEqual(inv.quantity, 5)
        self.assertEqual(Receipt.objects.get().purpose, "PRD-A")
        self.assertEqual(StockMovement.objects.get().purpose, "PRD-A")

    def test_inv_pur_11_purchase_order_purpose_is_inherited(self):
        po = self.create_purchase_order(order_number="PO-P2", quantity=10, purpose="PRD-A")
        self._receive(po)
        self.assertTrue(Inventory.objects.filter(purpose_rel_id="PRD-A", quantity=5).exists())

    def test_inv_pur_12_empty_purpose_overrides_to_generic(self):
        po = self.create_purchase_order(order_number="PO-P3", quantity=10, purpose="PRD-A")
        self._receive(po, purpose="")
        inv = Inventory.objects.get()
        self.assertIsNone(inv.purpose)

    def test_inv_pur_13_inactive_or_unknown_purpose_rejected(self):
        po = self.create_purchase_order(order_number="PO-P4", quantity=10)
        self.assertEqual(self._receive(po, purpose="OLD").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._receive(po, purpose="NOPE").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Inventory.objects.count(), 0)

    def test_inv_pur_14_move_keeps_purpose(self):
        source = self.create_inventory(location="A-01", quantity=10, purpose="PRD-A")
        url = reverse("inventory_api:inventory-move", kwargs={"pk": source.id})
        response = self.client.post(
            url,
            {"quantity_to_move": 4, "target_warehouse": self.warehouse_a.warehouse_number, "target_location": "B-01"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        target = Inventory.objects.get(location="B-01")
        self.assertEqual(target.purpose, "PRD-A")
        self.assertEqual(StockMovement.objects.filter(purpose_rel_id="PRD-A").count(), 2)

    def test_inv_pur_15_add_stock_goes_to_generic_not_purposed(self):
        self.create_inventory(location="", quantity=3, purpose="PRD-A")
        services.add_stock(self.item1.code, self.warehouse_a.warehouse_number, 2)
        self.assertEqual(Inventory.objects.get(purpose_rel_id="PRD-A").quantity, 3)
        self.assertEqual(Inventory.objects.get(purpose_rel__isnull=True).quantity, 2)

    def test_inv_pur_16_inventory_filter_by_purpose(self):
        self.create_inventory(location="A-01", quantity=1)
        self.create_inventory(location="A-01", quantity=2, purpose="PRD-A")
        url = reverse("inventory_api:inventory-list")
        self.assertEqual(self.client.get(url, {"purpose_query": "PRD-A"}).data["count"], 1)
        self.assertEqual(self.client.get(url, {"purpose_query": "none"}).data["count"], 1)
        self.assertEqual(self.client.get(url).data["count"], 2)


class ChangePurposeTests(InventoryAPITestBase):
    """INV-PUR-2x : 在庫の用途変更(緊急時の汎用への切り替え等)。"""

    def setUp(self):
        super().setUp()
        StockPurpose.objects.create(code="PRD-A", name="A製品用")
        StockPurpose.objects.create(code="PRD-B", name="B製品用")
        StockPurpose.objects.create(code="OLD", name="旧用途", is_active=False)
        self.source = self.create_inventory(location="A-01", quantity=10, reserved=2, purpose="PRD-A")
        self.url = reverse("inventory_api:inventory-change-purpose", kwargs={"pk": self.source.id})

    def _change(self, **payload):
        return self.client.post(self.url, payload, format="json")

    def test_inv_pur_20_switch_to_generic_creates_generic_row(self):
        response = self._change(quantity=5, purpose="", reason="緊急対応")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.source.refresh_from_db()
        self.assertEqual(self.source.quantity, 5)
        generic = Inventory.objects.get(purpose_rel__isnull=True)
        self.assertEqual(generic.quantity, 5)
        self.assertEqual(generic.location, "A-01")

    def test_inv_pur_21_merges_into_existing_target(self):
        self.create_inventory(location="A-01", quantity=3)  # 既存の汎用
        self._change(quantity=4, purpose="")
        self.assertEqual(Inventory.objects.get(purpose_rel__isnull=True).quantity, 7)
        self.assertEqual(Inventory.objects.count(), 2)

    def test_inv_pur_22_cannot_move_reserved_quantity(self):
        response = self._change(quantity=9, purpose="")  # 利用可能は 10-2=8
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.source.refresh_from_db()
        self.assertEqual(self.source.quantity, 10)

    def test_inv_pur_23_records_before_after_in_history(self):
        self._change(quantity=3, purpose="PRD-B", reason="B製品へ融通")
        out = StockMovement.objects.get(movement_type="outgoing")
        inc = StockMovement.objects.get(movement_type="incoming")
        self.assertEqual((out.purpose, inc.purpose), ("PRD-A", "PRD-B"))
        self.assertIn("B製品へ融通", out.description)
        self.assertEqual(out.quantity, 3)

    def test_inv_pur_24_validation_errors(self):
        self.assertEqual(self._change(quantity=1, purpose="PRD-A").status_code, 400)  # 同じ用途
        self.assertEqual(self._change(quantity=1, purpose="OLD").status_code, 400)  # 無効
        self.assertEqual(self._change(quantity=1, purpose="NOPE").status_code, 400)  # 不存在
        self.assertEqual(self._change(quantity=0, purpose="").status_code, 400)
        self.assertEqual(Inventory.objects.count(), 1)

    def test_inv_pur_25_inherits_first_received_at_and_flags(self):
        self.source.is_allocatable = False
        self.source.save()
        self._change(quantity=2, purpose="")
        generic = Inventory.objects.get(purpose_rel__isnull=True)
        self.assertEqual(generic.first_received_at, Inventory.objects.get(pk=self.source.pk).first_received_at)
        self.assertFalse(generic.is_allocatable)
