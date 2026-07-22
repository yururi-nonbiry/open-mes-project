from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory, SalesOrder

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

    def test_so_alloc_08_multiple_locations_same_part_warehouse_known_issue(self):
        """既知の懸念事項(修正後も残る別の不具合): allocate アクションは対象在庫を
        `part_number_rel_id`/`warehouse_rel_id` のみで検索しており、`location` は条件に含まれない。
        そのため同一品番+倉庫で棚番違いの在庫が複数存在する場合、`Inventory.objects.get(...)` が
        `MultipleObjectsReturned` を送出し、`ValueError` のみを捕捉する現行の `except` 節では
        処理されず未処理のまま伝播する。
        (以前はこの箇所で `part_number`/`warehouse` が @property であることに起因する
        `FieldError` が先に発生して隠れていたが、そちらは修正済み。本テストが検出するのは
        その修正後に露見した、より根本的な仕様上の懸念点である。
        docs/09_test_specifications/01_inventory.md の既知の懸念事項を参照。)
        """
        self.create_inventory(
            part_number=self.item1.code, warehouse=self.warehouse_a.warehouse_number, location="A-99", quantity=10
        )
        with self.assertRaises(Inventory.MultipleObjectsReturned):
            self._allocate()

    def test_so_alloc_09_empty_allocations_rejected(self):
        response = self._allocate(allocations=[])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_so_alloc_10_missing_sales_order_reference_rejected(self):
        response = self._allocate(sales_order_reference="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
