from django.urls import reverse
from rest_framework import status

from inventory.models import SalesOrder, StockMovement
from master.models import WorkCenter

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class LineTests(ProductionAPITestBase):
    """PP-LINE-* : 生産計画のラインを引当が引き継ぎ、引当ごとに変更でき、出庫(ピッキング)でラインを絞り込める。"""

    def setUp(self):
        super().setUp()
        WorkCenter.objects.create(code="LINE-1", name="第1ライン")
        WorkCenter.objects.create(code="LINE-2", name="第2ライン")
        self.wh = self.warehouse_a.warehouse_number
        self.create_inventory(location="A-01", quantity=100)

    def _allocate(self, plan, quantity, line=None):
        self.create_plan_material(plan, self.material_item1)
        url = reverse("production_api:production-plan-allocate-materials", args=[plan.id])
        item = {"part_number": self.material_item1.code, "warehouse": self.wh, "quantity_to_allocate": quantity}
        if line:
            item["line"] = line
        return self.client.post(url, {"allocations": [item]}, format="json")

    def test_pp_line_01_allocation_inherits_plan_line(self):
        plan = self.create_plan(line="LINE-1")
        self.assertEqual(self._allocate(plan, 5).status_code, status.HTTP_200_OK)
        allocation = MaterialAllocation.objects.get(production_plan=plan)
        self.assertEqual(allocation.line, "LINE-1")
        self.assertEqual(SalesOrder.objects.get(order_number__startswith="INT-").line, "LINE-1")

    def test_pp_line_02_line_can_be_overridden_at_allocation(self):
        plan = self.create_plan(line="LINE-1")
        self.assertEqual(self._allocate(plan, 5, line="LINE-2").status_code, status.HTTP_200_OK)
        self.assertEqual(MaterialAllocation.objects.get(production_plan=plan).line, "LINE-2")

    def test_pp_line_03_unknown_line_is_rejected(self):
        plan = self.create_plan()
        self.assertEqual(self._allocate(plan, 5, line="NOPE").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(MaterialAllocation.objects.filter(production_plan=plan).exists())

    def test_pp_line_04_change_line_syncs_sales_order_only_while_allocated(self):
        plan = self.create_plan(line="LINE-1")
        self._allocate(plan, 5)
        allocation = MaterialAllocation.objects.get(production_plan=plan)
        url = reverse("production_api:material-allocation-detail", args=[allocation.id])
        response = self.client.patch(url, {"line": "LINE-2"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(SalesOrder.objects.get(order_number__startswith="INT-").line, "LINE-2")

        # ピッキング(出庫)後は変更できず、出庫の記録に出庫時点のラインが残る
        change = reverse("production_api:material-allocation-change-status", args=[allocation.id])
        self.assertEqual(self.client.post(change, {"status": "ISSUED"}, format="json").status_code, 200)
        self.assertEqual(StockMovement.objects.get(reference_document=f"MaterialAllocation-{allocation.id}").line, "LINE-2")
        response = self.client.patch(url, {"line": "LINE-1"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_line_05_filter_allocations_by_line(self):
        plan = self.create_plan(line="LINE-1")
        self._allocate(plan, 5)
        url = reverse("production_api:material-allocation-list")
        self.assertEqual(self.client.get(url, {"line": "LINE-1"}).json()["count"], 1)
        self.assertEqual(self.client.get(url, {"line": "LINE-2"}).json()["count"], 0)
        self.assertEqual(self.client.get(url, {"line": "none"}).json()["count"], 0)
