from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from inventory.models import Inventory, SalesOrder, StockMovement

from ..models import WorkProgress
from .test_helpers import ProductionAPITestBase

PROCESS_STEP_OVERALL = "Overall Plan Progress"


class UpdateProgressTests(ProductionAPITestBase):
    """PP-PROG-* : 生産計画進捗更新アクション (POST plans/{id}/update-progress/)。"""

    def _url(self, plan):
        return reverse("production_api:production-plan-update-progress", args=[plan.id])

    def test_pp_prog_01_pending_to_in_progress(self):
        plan = self.create_plan(status="PENDING")
        response = self.client.post(self._url(plan), {"status": "IN_PROGRESS"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "IN_PROGRESS")
        self.assertIsNotNone(plan.actual_start_datetime)
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.status, "IN_PROGRESS")

    def test_pp_prog_02_in_progress_to_completed_adjusts_finished_goods_inventory(self):
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 10}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.product_item.code, warehouse_rel_id=self.warehouse_fg.warehouse_number
        )
        self.assertEqual(inventory.quantity, 10)
        self.assertTrue(
            StockMovement.objects.filter(movement_type="PRODUCTION_OUTPUT", quantity=10).exists()
        )
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.quantity_completed, 10)

    def test_pp_prog_03_completed_without_good_quantity_rejected(self):
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(self._url(plan), {"status": "COMPLETED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_04_good_plus_defective_exceeds_actual_rejected(self):
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(
            self._url(plan),
            {"status": "COMPLETED", "good_quantity": 8, "defective_quantity": 5, "actual_quantity": 10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_05_completing_consumes_allocated_materials(self):
        plan = self.create_plan(status="IN_PROGRESS")
        material_inventory = self.create_inventory(
            part_number=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=10, reserved=5
        )
        allocation = self.create_material_allocation(
            production_plan=plan,
            material_code=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            allocated_quantity=5,
            status="ALLOCATED",
        )
        so_number = f"INT-{allocation.id.hex[-15:]}"
        SalesOrder.objects.create(
            order_number=so_number,
            item=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=5,
            status="pending",
        )

        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        allocation.refresh_from_db()
        self.assertEqual(allocation.status, "ISSUED")
        material_inventory.refresh_from_db()
        self.assertEqual(material_inventory.quantity, 5)
        self.assertEqual(material_inventory.reserved, 0)
        self.assertTrue(StockMovement.objects.filter(movement_type="used", quantity=5).exists())
        so = SalesOrder.objects.get(order_number=so_number)
        self.assertEqual(so.status, "shipped")
        self.assertEqual(so.shipped_quantity, 5)

    def test_pp_prog_06_re_reporting_completed_applies_diff_only(self):
        plan = self.create_plan(status="COMPLETED")
        self.create_inventory(
            part_number=self.product_item.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=10,
        )
        WorkProgress.objects.create(
            production_plan=plan, process_step=PROCESS_STEP_OVERALL, status="COMPLETED", quantity_completed=10
        )

        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 15}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.product_item.code, warehouse_rel_id=self.warehouse_fg.warehouse_number
        )
        self.assertEqual(inventory.quantity, 15, "差分(15-10=5)のみ加算されること")

    def test_pp_prog_07_leaving_completed_reverses_inventory_and_restores_materials(self):
        plan = self.create_plan(status="COMPLETED")
        finished_inventory = self.create_inventory(
            part_number=self.product_item.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=10,
        )
        material_inventory = self.create_inventory(
            part_number=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=5, reserved=0
        )
        allocation = self.create_material_allocation(
            production_plan=plan,
            material_code=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            allocated_quantity=5,
            status="ISSUED",
        )
        so_number = f"INT-{allocation.id.hex[-15:]}"
        SalesOrder.objects.create(
            order_number=so_number,
            item=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=5,
            status="shipped",
            shipped_quantity=5,
        )
        WorkProgress.objects.create(
            production_plan=plan, process_step=PROCESS_STEP_OVERALL, status="COMPLETED", quantity_completed=10
        )

        response = self.client.post(self._url(plan), {"status": "ON_HOLD"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        finished_inventory.refresh_from_db()
        self.assertEqual(finished_inventory.quantity, 0)
        self.assertTrue(StockMovement.objects.filter(movement_type="PRODUCTION_REVERSAL").exists())

        material_inventory.refresh_from_db()
        self.assertEqual(material_inventory.quantity, 10)
        self.assertEqual(material_inventory.reserved, 5)
        allocation.refresh_from_db()
        self.assertEqual(allocation.status, "ALLOCATED")
        so = SalesOrder.objects.get(order_number=so_number)
        self.assertEqual(so.status, "pending")
        self.assertEqual(so.shipped_quantity, 0)

        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.quantity_completed, 0)
        self.assertEqual(wp.status, "PAUSED")

    def test_pp_prog_08_reversal_insufficient_stock_rejected(self):
        plan = self.create_plan(status="COMPLETED")
        self.create_inventory(
            part_number=self.product_item.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=5,
        )
        WorkProgress.objects.create(
            production_plan=plan, process_step=PROCESS_STEP_OVERALL, status="COMPLETED", quantity_completed=10
        )

        response = self.client.post(self._url(plan), {"status": "ON_HOLD"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_09_in_progress_to_cancelled(self):
        plan = self.create_plan(status="IN_PROGRESS", actual_start_datetime=timezone.now())
        response = self.client.post(self._url(plan), {"status": "CANCELLED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan.refresh_from_db()
        self.assertIsNotNone(plan.actual_end_datetime)
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.status, "PAUSED")

    def test_pp_prog_10_missing_status_rejected(self):
        plan = self.create_plan(status="PENDING")
        response = self.client.post(self._url(plan), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_11_on_hold_to_pending(self):
        plan = self.create_plan(status="ON_HOLD")
        response = self.client.post(self._url(plan), {"status": "PENDING"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.status, "NOT_STARTED")
