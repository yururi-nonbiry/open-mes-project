from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory, PurchaseOrder, Receipt

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
        self.assertIn("order_number", response.data["errors"])

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

    def test_po_crud_13_search_status_receivable_matches_pending_and_partial(self):
        self.create_purchase_order(
            order_number="PO-003", item="Item C", quantity=5, status="fully_received", received_quantity=5
        )
        url = reverse("inventory_api:purchaseorder-list")
        response = self.client.get(url, {"search_status": "receivable"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            sorted(po["order_number"] for po in response.data["results"]), ["PO-001", "PO-002"]
        )

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


class PurchaseOrderQuantityUpdateTests(InventoryAPITestBase):
    """PO-CRUD-10〜: 入庫済みの発注の数量変更。"""

    def setUp(self):
        super().setUp()
        self.po = self.create_purchase_order(
            order_number="PO-QTY-1", quantity=10, received_quantity=4, status="partially_received"
        )
        self.url = reverse("inventory_api:purchaseorder-detail", args=[self.po.id])

    def test_po_crud_10_quantity_below_received_rejected(self):
        response = self.client.patch(self.url, {"quantity": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_crud_11_quantity_reduced_to_received_marks_fully_received(self):
        response = self.client.patch(self.url, {"quantity": 4}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, "fully_received")

    def test_po_crud_12_delivery_fields_do_not_touch_stock(self):
        po = self.create_purchase_order(order_number="PO-DLV-1", quantity=10)
        url = reverse("inventory_api:purchaseorder-detail", args=[po.id])
        response = self.client.patch(url, {"delivery_date": "2026-09-30", "delivered_quantity": 7}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(str(po.delivery_date), "2026-09-30")
        self.assertEqual(po.delivered_quantity, 7)
        self.assertEqual(po.received_quantity, 0)
        self.assertEqual(po.status, "pending")
        self.assertFalse(Inventory.objects.exists())


class PurchaseOrderBulkUpsertTests(InventoryAPITestBase):
    """PO-BULK-* : 入庫予定の一括登録・更新。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("inventory_api:purchaseorder-bulk-upsert")
        self.po = self.create_purchase_order(
            order_number="PO-B-1", quantity=10, warehouse=self.warehouse_a.warehouse_number, location="A-01"
        )

    def _post(self, items):
        return self.client.post(self.url, {"items": items}, format="json")

    def test_po_bulk_01_update_existing_keeps_omitted_fields(self):
        response = self._post([{"order_number": "PO-B-1", "quantity": 12, "product_name": "更新後"}])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["result"], "updated")
        self.po.refresh_from_db()
        self.assertEqual(self.po.quantity, 12)
        self.assertEqual(self.po.product_name, "更新後")
        self.assertEqual(self.po.warehouse, self.warehouse_a.warehouse_number)
        self.assertEqual(self.po.location, "A-01")

    def test_po_bulk_02_create_when_allowed(self):
        response = self._post(
            [
                {
                    "order_number": "PO-B-NEW",
                    "allow_create": True,
                    "part_number": self.item2.code,
                    "quantity": 5,
                    "warehouse": self.warehouse_b.warehouse_number,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result = response.data["results"][0]
        self.assertEqual(result["result"], "created")
        po = PurchaseOrder.objects.get(order_number="PO-B-NEW")
        self.assertEqual(str(po.id), result["id"])
        self.assertEqual(po.warehouse, self.warehouse_b.warehouse_number)
        self.assertEqual(po.status, "pending")

    def test_po_bulk_03_not_found_without_allow_create(self):
        response = self._post([{"order_number": "PO-B-NONE", "quantity": 5}])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result = response.data["results"][0]
        self.assertEqual(result["result"], "error")
        self.assertIn("order_number", result["errors"])
        self.assertFalse(PurchaseOrder.objects.filter(order_number="PO-B-NONE").exists())

    def test_po_bulk_04_one_error_does_not_roll_back_others(self):
        response = self._post(
            [
                {"order_number": "PO-B-1", "quantity": 11},
                {"order_number": "PO-B-BAD", "allow_create": True, "part_number": "NO-SUCH-PART", "quantity": 1},
                {"order_number": "PO-B-2", "allow_create": True, "part_number": self.item1.code, "quantity": 3},
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([r["result"] for r in response.data["results"]], ["updated", "error", "created"])
        self.assertEqual(response.data["results"][1]["index"], 1)
        self.assertIn("part_number", response.data["results"][1]["errors"])
        self.assertEqual(response.data["summary"], {"created": 1, "updated": 1, "error": 1})
        self.po.refresh_from_db()
        self.assertEqual(self.po.quantity, 11)
        self.assertTrue(PurchaseOrder.objects.filter(order_number="PO-B-2").exists())
        self.assertFalse(PurchaseOrder.objects.filter(order_number="PO-B-BAD").exists())

    def test_po_bulk_05_cancel_without_receipt(self):
        response = self._post([{"order_number": "PO-B-1", "status": "canceled"}])
        self.assertEqual(response.data["results"][0]["result"], "updated")
        self.assertEqual(response.data["results"][0]["status"], "canceled")
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, "canceled")

    def test_po_bulk_06_cannot_cancel_when_received(self):
        self.create_purchase_order(
            order_number="PO-B-RCV", quantity=10, received_quantity=3, status="partially_received"
        )
        response = self._post([{"order_number": "PO-B-RCV", "status": "canceled", "product_name": "変更"}])
        result = response.data["results"][0]
        self.assertEqual(result["result"], "error")
        self.assertIn("status", result["errors"])
        po = PurchaseOrder.objects.get(order_number="PO-B-RCV")
        self.assertEqual(po.status, "partially_received")
        # 同じ行の他の項目の更新も取り消される
        self.assertIsNone(po.product_name)

    def test_po_bulk_07_uncancel_returns_to_pending(self):
        self.po.status = PurchaseOrder.Status.CANCELED
        self.po.save()
        response = self._post([{"order_number": "PO-B-1", "status": "pending"}])
        self.assertEqual(response.data["results"][0]["result"], "updated")
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, "pending")

    def test_po_bulk_08_pending_does_not_rewind_receipt_progress(self):
        self.create_purchase_order(
            order_number="PO-B-RCV", quantity=10, received_quantity=3, status="partially_received"
        )
        response = self._post([{"order_number": "PO-B-RCV", "status": "pending"}])
        self.assertEqual(response.data["results"][0]["result"], "updated")
        self.assertEqual(PurchaseOrder.objects.get(order_number="PO-B-RCV").status, "partially_received")

    def test_po_bulk_09_other_status_rejected(self):
        response = self._post([{"order_number": "PO-B-1", "status": "fully_received"}])
        result = response.data["results"][0]
        self.assertEqual(result["result"], "error")
        self.assertIn("status", result["errors"])
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, "pending")

    def test_po_bulk_10_quantity_below_received_rejected(self):
        self.create_purchase_order(
            order_number="PO-B-RCV", quantity=10, received_quantity=4, status="partially_received"
        )
        response = self._post([{"order_number": "PO-B-RCV", "quantity": 3}])
        result = response.data["results"][0]
        self.assertEqual(result["result"], "error")
        self.assertIn("quantity", result["errors"])
        self.assertEqual(PurchaseOrder.objects.get(order_number="PO-B-RCV").quantity, 10)

    def test_po_bulk_11_invalid_payload_rejected(self):
        for payload in ({"items": "x"}, {"items": []}, {}, [{"order_number": "PO-B-1"}]):
            response = self.client.post(self.url, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, payload)
        too_many = [{"order_number": f"PO-X-{i}", "allow_create": True, "quantity": 1} for i in range(501)]
        response = self._post(too_many)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PurchaseOrder.objects.filter(order_number__startswith="PO-X-").exists())

    def test_po_bulk_12_delivery_fields(self):
        response = self._post([{"order_number": "PO-B-1", "delivery_date": "2026-10-01", "delivered_quantity": 10}])
        self.assertEqual(response.data["results"][0]["result"], "updated")
        self.po.refresh_from_db()
        self.assertEqual(str(self.po.delivery_date), "2026-10-01")
        self.assertEqual(self.po.delivered_quantity, 10)
        self.assertEqual(self.po.received_quantity, 0)
        self.assertEqual(self.po.status, "pending")
        self.assertFalse(Inventory.objects.exists())
