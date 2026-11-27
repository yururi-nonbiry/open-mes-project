from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from base.feature_settings import MERGE_PLANS_ON_ALLOCATION, get_feature_flag, set_feature_flag
from inventory.models import Inventory
from master.models import BillOfMaterial, Item

from ..models import MaterialAllocation, ProductionPlan, WorkProgress
from .test_helpers import ProductionAPITestBase


class PlanMergeTests(ProductionAPITestBase):
    """PP-MERGE-* : 同一品番の生産計画の統合(merge-candidates / merge-plans / unmerge / bulk-allocate-materials の merge)。"""

    def setUp(self):
        super().setUp()
        now = timezone.now()
        # 納期はB(5日後)よりA(1日後)が早い
        self.plan_a = self.create_plan(
            plan_name="A", planned_quantity=30, planned_end_datetime=now + timedelta(days=1)
        )
        self.plan_b = self.create_plan(
            plan_name="B", planned_quantity=50, planned_end_datetime=now + timedelta(days=5)
        )
        for plan in (self.plan_a, self.plan_b):
            self.create_plan_material(plan, self.material_item1)

    def _merge(self, *plans):
        return self.client.post(
            reverse("production_api:production-plan-merge-plans"), {"plan_ids": [str(p.id) for p in plans]}, format="json"
        )

    def _merged(self):
        response = self._merge(self.plan_a, self.plan_b)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return ProductionPlan.objects.get(pk=response.json()["data"]["id"])

    def _complete(self, plan, good):
        url = reverse("production_api:production-plan-update-progress", kwargs={"pk": plan.pk})
        return self.client.post(url, {"status": "COMPLETED", "good_quantity": good}, format="json")

    def test_pp_merge_01_merge_sums_quantity_and_materials(self):
        merged = self._merged()
        self.assertEqual(merged.planned_quantity, 80)
        self.assertEqual(merged.planned_end_datetime, self.plan_a.planned_end_datetime)
        self.assertEqual(merged.materials.get(material=self.material_item1).required_quantity, 80)
        for plan in (self.plan_a, self.plan_b):
            plan.refresh_from_db()
            self.assertEqual(plan.status, "MERGED")
            self.assertEqual(plan.merged_into_id, merged.id)

    def test_pp_merge_02_candidates_group_by_product(self):
        other = Item.objects.create(code="PROD-002", name="Product 2", item_type="product")
        plan_c = self.create_plan(plan_name="C", product_code=other.code)
        ids = ",".join(str(p.id) for p in (self.plan_a, self.plan_b, plan_c))
        response = self.client.get(reverse("production_api:production-plan-merge-candidates"), {"ids": ids})
        groups = response.json()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["total_quantity"], 80)
        self.assertEqual([p["plan_name"] for p in groups[0]["plans"]], ["A", "B"])

    def test_pp_merge_02b_blockers_explain_why(self):
        self.create_material_allocation(production_plan=self.plan_a)
        ids = ",".join(str(p.id) for p in (self.plan_a, self.plan_b))
        response = self.client.get(reverse("production_api:production-plan-merge-blockers"), {"ids": ids})
        rows = {r["plan_name"]: r["reason"] for r in response.json()}
        self.assertIn("引当", rows["A"])
        self.assertIn("他にありません", rows["B"])

    def test_pp_merge_03_different_product_rejected(self):
        other = Item.objects.create(code="PROD-002", name="Product 2", item_type="product")
        plan_c = self.create_plan(plan_name="C", product_code=other.code)
        self.assertEqual(self._merge(self.plan_a, plan_c).status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_merge_04_allocated_plan_rejected(self):
        self.create_material_allocation(production_plan=self.plan_a)
        self.assertEqual(self._merge(self.plan_a, self.plan_b).status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_merge_05_bulk_allocate_with_merge(self):
        self.create_inventory(quantity=100)
        url = reverse("production_api:production-plan-bulk-allocate-materials")
        response = self.client.post(url, {"plan_ids": [str(self.plan_a.id), str(self.plan_b.id)], "merge": True}, format="json")
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "success")
        self.assertEqual(results[0]["merged_from"], ["A", "B"])
        merged = ProductionPlan.objects.get(pk=results[0]["plan_id"])
        self.assertEqual(MaterialAllocation.objects.get(production_plan=merged).allocated_quantity, 80)
        self.assertFalse(MaterialAllocation.objects.filter(production_plan=self.plan_a).exists())

    def test_pp_merge_06_bulk_allocate_without_merge_keeps_plans(self):
        self.create_inventory(quantity=100)
        url = reverse("production_api:production-plan-bulk-allocate-materials")
        response = self.client.post(url, {"plan_ids": [str(self.plan_a.id), str(self.plan_b.id)]}, format="json")
        self.assertEqual(len(response.json()["results"]), 2)
        self.assertEqual(ProductionPlan.objects.filter(status="MERGED").count(), 0)

    def test_pp_merge_07_completion_apportioned_by_due_date(self):
        merged = self._merged()
        self.assertEqual(self._complete(merged, 70).status_code, status.HTTP_200_OK)
        qty = {p.plan_name: WorkProgress.objects.get(production_plan=p).quantity_completed for p in (self.plan_a, self.plan_b)}
        self.assertEqual(qty, {"A": 30, "B": 40})
        self.plan_a.refresh_from_db()
        self.assertEqual(self.plan_a.status, "COMPLETED")

    def test_pp_merge_08_surplus_goes_to_last_plan(self):
        merged = self._merged()
        self._complete(merged, 85)
        self.assertEqual(WorkProgress.objects.get(production_plan=self.plan_b).quantity_completed, 55)

    def test_pp_merge_09_completion_reversal_restores_merged(self):
        merged = self._merged()
        self._complete(merged, 80)
        url = reverse("production_api:production-plan-update-progress", kwargs={"pk": merged.pk})
        self.client.post(url, {"status": "IN_PROGRESS"}, format="json")
        self.plan_a.refresh_from_db()
        self.assertEqual(self.plan_a.status, "MERGED")
        self.assertEqual(WorkProgress.objects.get(production_plan=self.plan_a).quantity_completed, 0)

    def test_pp_merge_10_unmerge_restores_plans(self):
        merged = self._merged()
        response = self.client.post(reverse("production_api:production-plan-unmerge", kwargs={"pk": merged.pk}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.plan_a.refresh_from_db()
        self.assertEqual((self.plan_a.status, self.plan_a.merged_into_id), ("PENDING", None))
        merged.refresh_from_db()
        self.assertEqual(merged.status, "CANCELLED")

    def test_pp_merge_11_unmerge_rejected_when_allocated(self):
        merged = self._merged()
        self.create_material_allocation(production_plan=merged)
        response = self.client.post(reverse("production_api:production-plan-unmerge", kwargs={"pk": merged.pk}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_merge_12_merged_plan_cannot_be_allocated_or_progressed(self):
        self._merged()
        url = reverse("production_api:production-plan-allocate-materials", kwargs={"pk": self.plan_a.pk})
        allocations = [{"part_number": self.material_item1.code, "warehouse": "WH-A", "quantity_to_allocate": 1}]
        self.assertEqual(self.client.post(url, {"allocations": allocations}, format="json").status_code, 400)
        self.assertEqual(self._complete(self.plan_a, 1).status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_merge_13_cancel_merged_plan_releases_originals(self):
        merged = self._merged()
        url = reverse("production_api:production-plan-update-progress", kwargs={"pk": merged.pk})
        self.client.post(url, {"status": "CANCELLED"}, format="json")
        self.plan_a.refresh_from_db()
        self.assertEqual(self.plan_a.status, "PENDING")

    def test_pp_merge_18_cancel_rejected_when_materials_picked_before_completion(self):
        """完了前にピッキングした部品が残る統合計画を中止すると、元計画で二重にピッキングできてしまう。"""
        merged = self._merged()
        self.create_material_allocation(production_plan=merged, status="ISSUED")
        url = reverse("production_api:production-plan-update-progress", kwargs={"pk": merged.pk})
        response = self.client.post(url, {"status": "CANCELLED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.plan_a.refresh_from_db()
        self.assertEqual(self.plan_a.status, "MERGED")

    def test_pp_merge_19_completed_original_cannot_be_deleted_or_issued(self):
        """統合計画の完了で完了になった元計画(status=COMPLETED, merged_into あり)も統合元として扱う。"""
        merged = self._merged()
        self.create_inventory(quantity=100)
        self.assertEqual(self._complete(merged, 80).status_code, status.HTTP_200_OK)
        self.plan_a.refresh_from_db()
        self.assertEqual((self.plan_a.status, self.plan_a.merged_into_id), ("COMPLETED", merged.id))
        response = self.client.delete(reverse("production_api:production-plan-detail", kwargs={"pk": self.plan_a.pk}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        url = reverse("production_api:production-plan-issue-additional-materials", kwargs={"pk": self.plan_a.pk})
        items = [{"part_number": self.material_item1.code, "warehouse": "WH-A", "quantity": 1}]
        self.assertEqual(self.client.post(url, {"items": items}, format="json").status_code, 400)
        self.assertTrue(ProductionPlan.objects.filter(pk=self.plan_a.pk).exists())

    def test_pp_merge_15_bom_snapshot_replaced_by_edited_materials(self):
        """BOMマスターがあると計画作成時に所要部品がコピーされる。統合計画では元計画の編集後の所要量を合算する。"""
        BillOfMaterial.objects.create(product=self.product_item, material=self.material_item1, quantity=1)
        now = timezone.now()
        a = self.create_plan(plan_name="A2", planned_quantity=30, planned_end_datetime=now + timedelta(days=1))
        b = self.create_plan(plan_name="B2", planned_quantity=50, planned_end_datetime=now + timedelta(days=5))
        self.assertEqual(a.materials.get().required_quantity, 30)  # 作成時にBOMからコピーされている
        self.create_plan_material(a, self.material_item1, required_quantity=99, quantity_per_unit=1)  # 計画ごとの編集
        response = self._merge(a, b)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        merged = ProductionPlan.objects.get(pk=response.json()["data"]["id"])
        self.assertEqual(merged.materials.count(), 1)
        self.assertEqual(merged.materials.get().required_quantity, 99 + 50)

    def test_pp_merge_14_feature_flag_default_off(self):
        self.assertFalse(get_feature_flag(MERGE_PLANS_ON_ALLOCATION))
        set_feature_flag(MERGE_PLANS_ON_ALLOCATION, True)
        self.assertTrue(get_feature_flag(MERGE_PLANS_ON_ALLOCATION))

    def test_pp_merge_16_completion_copies_finished_goods_destination_to_originals(self):
        """PP-MERGE-16: 統合計画の完成品の入庫倉庫・棚番を元計画にも記録し、完了の取消で元計画の記録も消す。"""
        merged = self._merged()
        url = reverse("production_api:production-plan-update-progress", kwargs={"pk": merged.pk})
        response = self.client.post(
            url, {"status": "COMPLETED", "good_quantity": 80, "warehouse": "WH-A", "location": "A-05"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.plan_a.refresh_from_db()
        self.assertEqual((self.plan_a.finished_goods_warehouse, self.plan_a.finished_goods_location), ("WH-A", "A-05"))

        self.client.post(url, {"status": "IN_PROGRESS"}, format="json")
        self.plan_a.refresh_from_db()
        self.assertIsNone(self.plan_a.finished_goods_warehouse)

    def test_pp_merge_17_apportioned_original_cannot_be_progressed(self):
        """PP-MERGE-17: 統合計画の完了で完了になった元計画は、単独で完了の取消・数量変更ができない。"""
        merged = self._merged()
        self.assertEqual(self._complete(merged, 80).status_code, status.HTTP_200_OK)
        stock_before = sum(row.quantity for row in Inventory.objects.filter(part_number_rel_id=merged.product_code))
        self.plan_a.refresh_from_db()
        self.assertEqual(self.plan_a.status, "COMPLETED")

        url = reverse("production_api:production-plan-update-progress", kwargs={"pk": self.plan_a.pk})
        self.assertEqual(self.client.post(url, {"status": "ON_HOLD"}, format="json").status_code, 400)
        self.assertEqual(self._complete(self.plan_a, 10).status_code, status.HTTP_400_BAD_REQUEST)

        self.plan_a.refresh_from_db()
        self.assertEqual(self.plan_a.status, "COMPLETED")
        self.assertEqual(WorkProgress.objects.get(production_plan=self.plan_a).quantity_completed, 30)
        stock_after = sum(row.quantity for row in Inventory.objects.filter(part_number_rel_id=merged.product_code))
        self.assertEqual(stock_after, stock_before)
