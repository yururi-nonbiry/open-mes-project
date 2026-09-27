from django.urls import reverse
from rest_framework import status

from inventory.models import SalesOrder

from .test_helpers import InventoryAPITestBase


class InternalSalesOrderTests(InventoryAPITestBase):
    """SO-INT-* : 生産計画の材料引当用に自動作成される内部受注(INT-)の保護。"""

    def setUp(self):
        super().setUp()
        self.inventory = self.create_inventory(quantity=10, reserved=5)
        self.internal_so = self.create_sales_order(
            order_number=f"{SalesOrder.INTERNAL_ORDER_PREFIX}0123456789abcde",
            item=self.item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=5,
        )
        self.normal_so = self.create_sales_order(
            order_number="SO-NORMAL-1",
            item=self.item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=3,
        )

    def _detail_url(self, so):
        return reverse("inventory_api:salesorder-detail", args=[so.id])

    def test_so_int_01_issue_rejected(self):
        response = self.client.post(
            reverse("inventory_api:salesorder-issue"),
            {"order_id": str(self.internal_so.id), "quantity_to_ship": 5},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)
        self.assertEqual(self.inventory.reserved, 5)

    def test_so_int_02_update_and_delete_rejected(self):
        response = self.client.patch(self._detail_url(self.internal_so), {"quantity": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.delete(self._detail_url(self.internal_so))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(SalesOrder.objects.filter(pk=self.internal_so.pk, quantity=5).exists())

    def test_so_int_03_reserved_prefix_rejected_on_create_and_allocate(self):
        response = self.client.post(
            reverse("inventory_api:salesorder-list"),
            {"order_number": "INT-MANUAL", "item": self.item1.code, "quantity": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            reverse("inventory_api:salesorder-allocate"),
            {
                "sales_order_reference": "INT-MANUAL",
                "allocations": [
                    {"part_number": self.item1.code, "warehouse": self.warehouse_a.warehouse_number, "quantity_to_reserve": 1}
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_int_04_exclude_internal_filter(self):
        url = reverse("inventory_api:salesorder-list")
        numbers = [r["order_number"] for r in self.client.get(url).data["results"]]
        self.assertIn(self.internal_so.order_number, numbers)
        numbers = [r["order_number"] for r in self.client.get(url, {"exclude_internal": "true"}).data["results"]]
        self.assertEqual(numbers, [self.normal_so.order_number])
        detail = self.client.get(self._detail_url(self.internal_so)).data
        self.assertTrue(detail["is_internal"])
