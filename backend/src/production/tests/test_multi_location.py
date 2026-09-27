from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory, SalesOrder, StockMovement

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class ProductionMultiLocationTests(ProductionAPITestBase):
    """PP-MLOC-* : 同一品番+倉庫で棚番違いの在庫が複数ある場合の生産側の在庫操作。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan(status="IN_PROGRESS")
        self.create_plan_material(self.plan, self.material_item1)
        self.loc1 = self.create_inventory(location="A-01", quantity=3)
        self.loc2 = self.create_inventory(location="A-02", quantity=10)

    def _refresh(self):
        self.loc1.refresh_from_db()
        self.loc2.refresh_from_db()

    def _allocate(self, quantity):
        url = reverse("production_api:production-plan-allocate-materials", args=[self.plan.id])
        return self.client.post(
            url,
            {
                "allocations": [
                    {
                        "part_number": self.material_item1.code,
                        "warehouse": self.warehouse_a.warehouse_number,
                        "quantity_to_allocate": quantity,
                    }
                ]
            },
            format="json",
        )

    def test_pp_mloc_01_allocate_across_locations(self):
        response = self._allocate(5)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._refresh()
        self.assertEqual((self.loc1.reserved, self.loc2.reserved), (3, 2))

    def test_pp_mloc_02_completion_consumes_across_locations(self):
        self._allocate(5)
        response = self.client.post(
            reverse("production_api:production-plan-update-progress", args=[self.plan.id]),
            {"status": "COMPLETED", "good_quantity": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._refresh()
        self.assertEqual((self.loc1.quantity, self.loc1.reserved), (0, 0))
        self.assertEqual((self.loc2.quantity, self.loc2.reserved), (8, 0))
        self.assertEqual(
            StockMovement.objects.filter(movement_type="used", part_number_rel_id=self.material_item1.code).count(), 2
        )

    def test_pp_mloc_03_release_and_manual_issue_across_locations(self):
        self._allocate(5)
        allocation = MaterialAllocation.objects.get(production_plan=self.plan)
        response = self.client.post(
            reverse("production_api:material-allocation-change-status", args=[allocation.id]),
            {"status": "ISSUED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self._refresh()
        self.assertEqual(self.loc1.quantity + self.loc2.quantity, 8)
        self.assertEqual(self.loc1.reserved + self.loc2.reserved, 0)

    def test_pp_mloc_04_reversal_does_not_consume_reserved_finished_goods(self):
        """完了の取消で完成品を減らす際、受注が引き当てている完成品在庫は減らせない。"""
        fg = self.warehouse_fg.warehouse_number
        self.client.post(
            reverse("production_api:production-plan-update-progress", args=[self.plan.id]),
            {"status": "COMPLETED", "good_quantity": 10},
            format="json",
        )
        fg_inventory = Inventory.objects.get(part_number_rel_id=self.product_item.code, warehouse_rel_id=fg)
        fg_inventory.reserved = 8
        fg_inventory.save()
        SalesOrder.objects.create(
            order_number="SO-FG-1", item=self.product_item.code, warehouse=fg, quantity=8, reserved_quantity=8
        )
        response = self.client.post(
            reverse("production_api:production-plan-update-progress", args=[self.plan.id]),
            {"status": "ON_HOLD"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fg_inventory.refresh_from_db()
        self.assertEqual((fg_inventory.quantity, fg_inventory.reserved), (10, 8))
