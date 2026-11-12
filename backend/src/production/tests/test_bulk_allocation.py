from django.urls import reverse
from rest_framework import status

from master.models import BillOfMaterial, Warehouse

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class BulkAllocationTests(ProductionAPITestBase):
    """PP-BULK-* : 一覧の引当状況(GET plans/allocation-overview/)とまとめ引当(POST plans/bulk-allocate-materials/)。"""

    def setUp(self):
        super().setUp()
        self.overview_url = reverse("production_api:production-plan-allocation-overview")
        self.bulk_url = reverse("production_api:production-plan-bulk-allocate-materials")
        self.plan = self.create_plan()

    def _overview(self, *plans):
        response = self.client.get(self.overview_url, {"ids": ",".join(str(p.id) for p in plans)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["plan_id"]: row for row in response.json()}

    def _bulk(self, *plans):
        return self.client.post(self.bulk_url, {"plan_ids": [str(p.id) for p in plans]}, format="json")

    def test_pp_bulk_01_overview_no_master(self):
        self.assertEqual(self._overview(self.plan)[str(self.plan.id)]["state"], "NO_MASTER")

    def test_pp_bulk_02_overview_ready_shortage_allocated(self):
        BillOfMaterial.objects.create(product=self.product_item, material=self.material_item1, quantity=1)
        self.create_plan_material(self.plan, self.material_item1)  # 所要10
        self.create_inventory(quantity=10)
        self.assertEqual(self._overview(self.plan)[str(self.plan.id)]["state"], "READY")
        self.create_plan_material(self.plan, self.material_item2)  # 在庫なし
        row = self._overview(self.plan)[str(self.plan.id)]
        self.assertEqual(row["state"], "SHORTAGE")
        self.assertEqual(row["shortage_parts"], [self.material_item2.code])
        self.assertTrue(row["has_bom"])

    def test_pp_bulk_03_bulk_allocates_across_warehouses(self):
        wh_b = Warehouse.objects.create(warehouse_number="WH-B", name="Warehouse B")
        self.create_plan_material(self.plan, self.material_item1)  # 所要10
        self.create_inventory(quantity=6)
        self.create_inventory(quantity=7, warehouse=wh_b.warehouse_number, location="B-01")
        response = self._bulk(self.plan)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result = response.json()["results"][0]
        self.assertEqual(result["status"], "success")
        total = sum(a.allocated_quantity for a in MaterialAllocation.objects.filter(production_plan=self.plan))
        self.assertEqual(total, 10)
        self.assertEqual(self._overview(self.plan)[str(self.plan.id)]["state"], "ALLOCATED")

    def test_pp_bulk_04_shortage_allocates_available_only(self):
        self.create_plan_material(self.plan, self.material_item1)
        self.create_inventory(quantity=4)
        result = self._bulk(self.plan).json()["results"][0]
        self.assertEqual(result["status"], "partial")
        allocation = MaterialAllocation.objects.get(production_plan=self.plan)
        self.assertEqual(allocation.allocated_quantity, 4)

    def test_pp_bulk_05_skips_no_master_and_completed_and_continues(self):
        completed = self.create_plan(plan_name="Done", status="COMPLETED")
        self.create_plan_material(completed, self.material_item1)
        self.create_plan_material(self.plan, self.material_item1)
        self.create_inventory(quantity=20)
        results = {r["plan_id"]: r for r in self._bulk(completed, self.plan).json()["results"]}
        self.assertEqual(results[str(completed.id)]["status"], "skipped")
        self.assertEqual(results[str(self.plan.id)]["status"], "success")
        self.assertFalse(MaterialAllocation.objects.filter(production_plan=completed).exists())

    def test_pp_bulk_06_second_run_is_noop(self):
        self.create_plan_material(self.plan, self.material_item1)
        self.create_inventory(quantity=10)
        self._bulk(self.plan)
        result = self._bulk(self.plan).json()["results"][0]
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(MaterialAllocation.objects.filter(production_plan=self.plan).count(), 1)

    def test_pp_bulk_07_invalid_ids_rejected(self):
        self.assertEqual(self.client.post(self.bulk_url, {"plan_ids": []}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.bulk_url, {"plan_ids": ["x"]}, format="json").status_code, 400)
