from django.urls import reverse
from rest_framework import status

from inventory.models import SalesOrder

from .test_helpers import InventoryAPITestBase


class AllocateTests(InventoryAPITestBase):
    """SO-ALLOC-* : 受注引当アクション (POST sales-orders/allocate/)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("inventory_api:salesorder-allocate")
        self.inventory = self.create_inventory(quantity=10, reserved=0)

    def _allocate(self, **overrides):
        payload = {
            "sales_order_reference": "SO-ALLOC-1",
            "allocations": [
                {
                    "part_number": self.item1.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 5,
                }
            ],
        }
        payload.update(overrides)
        return self.client.post(self.url, payload, format="json")

    def test_so_alloc_01_success_creates_sales_order(self):
        response = self._allocate()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 5)
        self.assertTrue(SalesOrder.objects.filter(order_number="SO-ALLOC-1").exists())

    def test_so_alloc_02_success_adds_to_existing_sales_order(self):
        self._allocate()
        response = self._allocate(
            allocations=[
                {
                    "part_number": self.item1.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 3,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 8)
        self.assertEqual(SalesOrder.objects.filter(order_number="SO-ALLOC-1").count(), 1)

    def test_so_alloc_03_insufficient_stock_rejected(self):
        response = self._allocate(
            allocations=[
                {
                    "part_number": self.item1.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 999,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0)

    def test_so_alloc_04_inventory_not_found_rejected(self):
        response = self._allocate(
            allocations=[
                {
                    "part_number": "NO-SUCH-PART",
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 1,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_05_inactive_inventory_rejected(self):
        self.inventory.is_active = False
        self.inventory.save()
        response = self._allocate()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_05b_not_allocatable_inventory_rejected(self):
        self.inventory.is_allocatable = False
        self.inventory.save()
        response = self._allocate()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_06_existing_order_item_warehouse_mismatch_rejected(self):
        self._allocate()
        self.create_inventory(
            part_number=self.item2.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=10
        )
        response = self._allocate(
            allocations=[
                {
                    "part_number": self.item2.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 1,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_07_partial_failure_rolls_back_all(self):
        self.create_inventory(
            part_number=self.item2.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=1
        )
        response = self._allocate(
            allocations=[
                {
                    "part_number": self.item1.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 5,
                },
                {
                    "part_number": self.item2.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 999,
                },
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0, "1件目の引当もアトミックにロールバックされること")

    def test_so_alloc_08_multi_location_consumes_in_location_order(self):
        """同一品番+倉庫で棚番違いの在庫が複数存在する場合、入庫が古い順(first_received_at昇順)で
        必要数量に達するまで複数ロケーションから引き当てられることを確認する。
        """
        self.inventory.quantity = 3
        self.inventory.save()
        second = self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=10
        )
        response = self._allocate(
            allocations=[
                {
                    "part_number": self.item1.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 6,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        second.refresh_from_db()
        # A-01(quantity=3)を使い切り、残り3をA-02から引き当てる
        self.assertEqual(self.inventory.reserved, 3)
        self.assertEqual(second.reserved, 3)
        locations_consumed = response.data["allocations_summary"][0]["locations_consumed"]
        self.assertEqual(
            locations_consumed,
            [{"location": "A-01", "reserved_quantity": 3}, {"location": "A-02", "reserved_quantity": 3}],
        )

    def test_so_alloc_08b_multi_location_total_insufficient_rejected(self):
        self.inventory.quantity = 2
        self.inventory.save()
        self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=1
        )
        response = self._allocate(
            allocations=[
                {
                    "part_number": self.item1.code,
                    "warehouse": self.warehouse_a.warehouse_number,
                    "quantity_to_reserve": 10,
                }
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0, "在庫不足の場合はどのロケーションも変更されないこと")

    def test_so_alloc_08c_ineligible_location_skipped(self):
        self.inventory.is_allocatable = False
        self.inventory.save()
        second = self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-02", quantity=10
        )
        response = self._allocate()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0, "引当不可ロケーションは対象外のまま")
        self.assertEqual(second.reserved, 5)

    def test_so_alloc_08d_all_locations_ineligible_rejected(self):
        self.inventory.is_active = False
        self.inventory.save()
        self.create_inventory(
            part_number=self.item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            location="A-02",
            quantity=10,
            is_active=False,
        )
        response = self._allocate()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_09_empty_allocations_rejected(self):
        response = self._allocate(allocations=[])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_10_missing_sales_order_reference_rejected(self):
        response = self._allocate(sales_order_reference="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
