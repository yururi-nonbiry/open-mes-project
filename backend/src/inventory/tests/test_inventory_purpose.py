from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status

from inventory import services
from inventory.models import Inventory, Receipt, SalesOrder, StockMovement
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


class SalesOrderPurposeTests(InventoryAPITestBase):
    """INV-PUR-3x : 受注の用途に応じた引当・出庫(指定用途→汎用の順。他の用途は使わない)。"""

    def setUp(self):
        super().setUp()
        StockPurpose.objects.create(code="PRD-A", name="A製品用")
        StockPurpose.objects.create(code="PRD-B", name="B製品用")
        self.stock_a = self.create_inventory(location="A-01", quantity=4, purpose="PRD-A")
        self.stock_b = self.create_inventory(location="A-01", quantity=100, purpose="PRD-B")
        self.stock_generic = self.create_inventory(location="A-01", quantity=10)

    def _allocate(self, ref, quantity, **extra):
        payload = {
            "sales_order_reference": ref,
            "allocations": [
                {"part_number": self.item1.code, "warehouse": "WH-A", "quantity_to_reserve": quantity}
            ],
        }
        payload.update(extra)
        return self.client.post(reverse("inventory_api:salesorder-allocate"), payload, format="json")

    def _reload(self):
        for obj in (self.stock_a, self.stock_b, self.stock_generic):
            obj.refresh_from_db()

    def test_inv_pur_30_allocate_purpose_first_then_generic(self):
        response = self._allocate("SO-P1", 8, purpose="PRD-A")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._reload()
        self.assertEqual((self.stock_a.reserved, self.stock_generic.reserved, self.stock_b.reserved), (4, 4, 0))
        self.assertEqual(SalesOrder.objects.get(order_number="SO-P1").purpose, "PRD-A")

    def test_inv_pur_31_order_without_purpose_ignores_purposed_stock(self):
        self.assertEqual(self._allocate("SO-P2", 11).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._allocate("SO-P2", 10).status_code, status.HTTP_200_OK)
        self._reload()
        self.assertEqual((self.stock_generic.reserved, self.stock_a.reserved), (10, 0))

    def test_inv_pur_32_issue_uses_order_purpose_and_releases_reservation(self):
        self._allocate("SO-P3", 8, purpose="PRD-A")
        so = SalesOrder.objects.get(order_number="SO-P3")
        response = self.client.post(
            reverse("inventory_api:salesorder-issue"), {"order_id": str(so.id), "quantity_to_ship": 8}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._reload()
        self.assertEqual((self.stock_a.quantity, self.stock_a.reserved), (0, 0))
        self.assertEqual((self.stock_generic.quantity, self.stock_generic.reserved), (6, 0))
        self.assertEqual(self.stock_b.quantity, 100)
        self.assertTrue(StockMovement.objects.filter(purpose_rel_id="PRD-A", movement_type="outgoing").exists())

    def test_inv_pur_33_existing_order_purpose_mismatch_rejected(self):
        self._allocate("SO-P4", 2, purpose="PRD-A")
        self.assertEqual(self._allocate("SO-P4", 1, purpose="PRD-B").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._allocate("SO-P4", 1).status_code, status.HTTP_200_OK)  # 用途省略は既存の用途を使う

    def test_inv_pur_34_cancel_releases_from_same_rows(self):
        self._allocate("SO-P5", 8, purpose="PRD-A")
        so = SalesOrder.objects.get(order_number="SO-P5")
        url = reverse("inventory_api:salesorder-change-status", kwargs={"pk": so.id})
        self.assertEqual(self.client.post(url, {"status": "canceled"}, format="json").status_code, 200)
        self._reload()
        self.assertEqual((self.stock_a.reserved, self.stock_generic.reserved), (0, 0))

    def test_inv_pur_35_purpose_locked_after_reservation(self):
        self._allocate("SO-P6", 2, purpose="PRD-A")
        so = SalesOrder.objects.get(order_number="SO-P6")
        url = reverse("inventory_api:salesorder-detail", kwargs={"pk": so.id})
        self.assertEqual(self.client.patch(url, {"purpose": "PRD-B"}, format="json").status_code, 400)
