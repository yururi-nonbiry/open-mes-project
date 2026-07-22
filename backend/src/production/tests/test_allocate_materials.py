from django.urls import reverse
from rest_framework import status

from inventory.models import SalesOrder

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class AllocateMaterialsTests(ProductionAPITestBase):
    """PP-ALLOC-* : 資材引当アクション (POST plans/{id}/allocate-materials/)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan()
        self.url = reverse("production_api:production-plan-allocate-materials", args=[self.plan.id])
        self.inventory = self.create_inventory(quantity=10, reserved=0)

    def _item(self, quantity, part_number=None, warehouse=None):
        return {
            "part_number": part_number or self.material_item1.code,
            "warehouse": warehouse or self.warehouse_a.warehouse_number,
            "quantity_to_allocate": quantity,
        }

    def _allocate(self, allocations):
        return self.client.post(self.url, {"allocations": allocations}, format="json")

    def test_pp_alloc_01_success(self):
        response = self._allocate([self._item(5)])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 5)
        allocation = MaterialAllocation.objects.get(production_plan=self.plan)
        self.assertEqual(allocation.status, "ALLOCATED")
        self.assertEqual(allocation.allocated_quantity, 5)
        so_number = f"INT-{allocation.id.hex[-15:]}"
        self.assertTrue(SalesOrder.objects.filter(order_number=so_number, status="pending").exists())

    def test_pp_alloc_02_within_bom_requirement(self):
        self.plan.production_plan = "BOM-1"
        self.plan.save()
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, quantity_used=5)
        response = self._allocate([self._item(5)])
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pp_alloc_03_exceeds_bom_requirement_rejected(self):
        self.plan.production_plan = "BOM-1"
        self.plan.save()
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, quantity_used=5)
        response = self._allocate([self._item(6)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0)

    def test_pp_alloc_04_inventory_not_found_rejected(self):
        response = self._allocate([self._item(1, part_number="NO-SUCH-PART")])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_alloc_05_inactive_inventory_rejected(self):
        self.inventory.is_active = False
        self.inventory.save()
        response = self._allocate([self._item(1)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_alloc_06_insufficient_stock_rejected(self):
        response = self._allocate([self._item(999)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_alloc_07_partial_failure_rolls_back_all(self):
        second_inventory = self.create_inventory(part_number=self.material_item2.code, quantity=1)
        response = self._allocate(
            [self._item(5), self._item(999, part_number=self.material_item2.code)]
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        second_inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0, "1件目の引当もアトミックにロールバックされること")
        self.assertEqual(second_inventory.reserved, 0)

    def test_pp_alloc_08_empty_allocations_rejected(self):
        response = self._allocate([])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_alloc_08b_non_list_allocations_rejected(self):
        response = self.client.post(self.url, {"allocations": "not-a-list"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_alloc_09_zero_quantity_silently_skipped(self):
        response = self._allocate([self._item(0)])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["allocations_summary"], [])
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0)

    def test_pp_alloc_09b_negative_quantity_rejected(self):
        response = self._allocate([self._item(-1)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
