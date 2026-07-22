import uuid

from django.urls import reverse
from rest_framework import status

from inventory.models import StockMovement

from .test_helpers import InventoryAPITestBase


class IssueTests(InventoryAPITestBase):
    """SO-ISSUE-* : 受注出庫アクション (POST sales-orders/issue/)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("inventory_api:salesorder-issue")
        self.inventory = self.create_inventory(quantity=10, reserved=2)
        self.so = self.create_sales_order(
            order_number="SO-ISSUE-1",
            item=self.item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=10,
        )

    def _issue(self, **overrides):
        payload = {"order_id": str(self.so.id), "quantity_to_ship": 10}
        payload.update(overrides)
        return self.client.post(self.url, payload, format="json")

    def test_so_issue_01_full_shipment(self):
        response = self._issue()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.so.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 0)
        self.assertEqual(self.so.shipped_quantity, 10)
        self.assertEqual(self.so.status, "shipped")
        self.assertTrue(
            StockMovement.objects.filter(
                movement_type="outgoing", reference_document=f"SO: {self.so.order_number}"
            ).exists()
        )

    def test_so_issue_02_partial_shipment_stays_pending(self):
        response = self._issue(quantity_to_ship=4)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.so.refresh_from_db()
        self.assertEqual(self.so.shipped_quantity, 4)
        self.assertEqual(self.so.status, "pending")

    def test_so_issue_03_cumulative_partial_shipments_complete_order(self):
        self._issue(quantity_to_ship=4)
        response = self._issue(quantity_to_ship=6)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.so.refresh_from_db()
        self.assertEqual(self.so.shipped_quantity, 10)
        self.assertEqual(self.so.status, "shipped")

    def test_so_issue_04_already_shipped_rejected(self):
        self.so.status = "shipped"
        self.so.shipped_quantity = 10
        self.so.save()
        response = self._issue(quantity_to_ship=1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_05_canceled_rejected(self):
        self.so.status = "canceled"
        self.so.save()
        response = self._issue(quantity_to_ship=1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_06_exceeding_remaining_quantity_rejected(self):
        response = self._issue(quantity_to_ship=11)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_07_inventory_not_found(self):
        so2 = self.create_sales_order(
            order_number="SO-ISSUE-2", item=self.item2.code, warehouse=self.warehouse_b.warehouse_number, quantity=1
        )
        response = self._issue(order_id=str(so2.id), quantity_to_ship=1)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_so_issue_08_multi_location_consumes_in_location_order(self):
        """同一品番+倉庫で棚番違いの在庫が複数存在する場合、棚番(location)の昇順で
        出庫数量に達するまで複数ロケーションから出庫され、ロケーションごとに
        StockMovementが記録されることを確認する。
        """
        self.inventory.quantity = 4
        self.inventory.reserved = 0
        self.inventory.save()
        second = self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=10
        )
        response = self._issue(quantity_to_ship=6)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        second.refresh_from_db()
        # A-01(quantity=4)を使い切り、残り2をA-02から出庫する
        self.assertEqual(self.inventory.quantity, 0)
        self.assertEqual(second.quantity, 8)
        self.assertTrue(
            StockMovement.objects.filter(movement_type="outgoing", location="A-01", quantity=4).exists()
        )
        self.assertTrue(
            StockMovement.objects.filter(movement_type="outgoing", location="A-02", quantity=2).exists()
        )

    def test_so_issue_08b_multi_location_total_insufficient_rejected(self):
        self.inventory.quantity = 2
        self.inventory.save()
        self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=1
        )
        response = self._issue(quantity_to_ship=10)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 2, "在庫不足の場合はどのロケーションも変更されないこと")

    def test_so_issue_08c_inactive_location_skipped(self):
        self.inventory.is_active = False
        self.inventory.save()
        second = self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=10
        )
        response = self._issue(quantity_to_ship=5)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10, "無効化されたロケーションは対象外のまま")
        self.assertEqual(second.quantity, 5)

    def test_so_issue_09_inactive_inventory_rejected(self):
        self.inventory.is_active = False
        self.inventory.save()
        response = self._issue(quantity_to_ship=1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_10_insufficient_raw_quantity_rejected(self):
        self.inventory.quantity = 3
        self.inventory.save()
        response = self._issue(quantity_to_ship=5)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_11_reserved_does_not_go_negative(self):
        # reserved(2) < quantity_to_ship(5) でも reserved は0止まりでマイナスにならない
        response = self._issue(quantity_to_ship=5)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0)

    def test_so_issue_12_invalid_quantity_rejected(self):
        response = self._issue(quantity_to_ship=0)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_12b_missing_order_id_rejected(self):
        response = self.client.post(self.url, {"quantity_to_ship": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_issue_13_is_allocatable_false_not_checked(self):
        # issue は is_allocatable を確認しない仕様(allocateとの非対称性、既知の懸念事項2)
        self.inventory.is_allocatable = False
        self.inventory.save()
        response = self._issue(quantity_to_ship=1)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_so_issue_not_found_order_id(self):
        response = self._issue(order_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
