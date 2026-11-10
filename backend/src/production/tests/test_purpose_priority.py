from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory
from master.models import StockPurpose

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class PurposePriorityTests(ProductionAPITestBase):
    """PP-PUR-* : 生産計画の用途に応じた在庫の使い分け(指定用途→汎用の順。他の用途は使わない)。"""

    def setUp(self):
        super().setUp()
        StockPurpose.objects.create(code="PRD-A", name="A製品用")
        StockPurpose.objects.create(code="PRD-B", name="B製品用")
        self.wh = self.warehouse_a.warehouse_number
        self.stock_a = self.create_inventory(location="A-01", quantity=4, purpose="PRD-A")
        self.stock_b = self.create_inventory(location="A-01", quantity=100, purpose="PRD-B")
        self.stock_generic = self.create_inventory(location="A-01", quantity=10)

    def _allocate(self, plan, quantity):
        self.create_plan_material(plan, self.material_item1)
        url = reverse("production_api:production-plan-allocate-materials", args=[plan.id])
        item = {"part_number": self.material_item1.code, "warehouse": self.wh, "quantity_to_allocate": quantity}
        return self.client.post(url, {"allocations": [item]}, format="json")

    def _reload(self):
        for obj in (self.stock_a, self.stock_b, self.stock_generic):
            obj.refresh_from_db()

    def test_pp_pur_01_uses_own_purpose_first_then_generic(self):
        plan = self.create_plan(purpose="PRD-A")
        self.assertEqual(self._allocate(plan, 8).status_code, status.HTTP_200_OK)
        self._reload()
        self.assertEqual(self.stock_a.reserved, 4)
        self.assertEqual(self.stock_generic.reserved, 4)
        self.assertEqual(self.stock_b.reserved, 0)  # 他の用途は使わない
        allocation = MaterialAllocation.objects.get(production_plan=plan)
        self.assertEqual(allocation.purpose, "PRD-A")

    def test_pp_pur_02_never_uses_other_purpose_even_if_short(self):
        plan = self.create_plan(purpose="PRD-A")
        # 使える在庫は A(4) + 汎用(10) = 14。B の100は使えない
        response = self._allocate(plan, 15)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self._reload()
        self.assertEqual(self.stock_b.reserved, 0)

    def test_pp_pur_03_plan_without_purpose_uses_generic_only(self):
        plan = self.create_plan()
        self.assertEqual(self._allocate(plan, 11).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._allocate(plan, 10).status_code, status.HTTP_200_OK)
        self._reload()
        self.assertEqual(self.stock_generic.reserved, 10)
        self.assertEqual(self.stock_a.reserved, 0)

    def test_pp_pur_04_release_and_consume_follow_allocation_purpose(self):
        plan = self.create_plan(purpose="PRD-A", status="IN_PROGRESS")
        self._allocate(plan, 8)
        # 完了で材料を消費: A(4)と汎用(4)が減り、Bは動かない
        url = reverse("production_api:production-plan-update-progress", args=[plan.id])
        response = self.client.post(url, {"status": "COMPLETED", "good_quantity": 10}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._reload()
        self.assertEqual((self.stock_a.quantity, self.stock_a.reserved), (0, 0))
        self.assertEqual((self.stock_generic.quantity, self.stock_generic.reserved), (6, 0))
        self.assertEqual(self.stock_b.quantity, 100)

    def test_pp_pur_05_deleting_allocation_releases_same_rows(self):
        plan = self.create_plan(purpose="PRD-A")
        self._allocate(plan, 8)
        allocation = MaterialAllocation.objects.get(production_plan=plan)
        url = reverse("production_api:material-allocation-detail", args=[allocation.id])
        self.assertIn(self.client.delete(url).status_code, (200, 204))
        self._reload()
        self.assertEqual((self.stock_a.reserved, self.stock_generic.reserved, self.stock_b.reserved), (0, 0, 0))

    def test_pp_pur_06_plan_purpose_locked_after_allocation(self):
        plan = self.create_plan(purpose="PRD-A")
        self._allocate(plan, 2)
        url = reverse("production_api:production-plan-detail", args=[plan.id])
        response = self.client.patch(url, {"purpose": "PRD-B"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_pur_07_required_parts_counts_only_usable_stock(self):
        plan = self.create_plan(purpose="PRD-A")
        self.create_plan_material(plan, self.material_item1)
        url = reverse("production_api:production-plan-required-parts", args=[plan.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data if isinstance(response.data, list) else response.data.get("data", response.data)
        self.assertEqual(data[0]["inventory_quantity"], 14)  # A(4)+汎用(10)。B(100)は含めない
