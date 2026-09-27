import importlib
from decimal import Decimal

from django.apps import apps
from django.urls import reverse
from rest_framework import status

from master.models import BillOfMaterial, Item

from ..models import PartsUsed, ProductionPlanMaterial
from .test_helpers import ProductionAPITestBase


class PlanMaterialSnapshotTests(ProductionAPITestBase):
    """PP-MAT-SNAP-* : 生産計画の作成・変更に伴う所要部品の自動作成・再計算(production/signals.py)。"""

    def setUp(self):
        super().setUp()
        self.sub_item = Item.objects.create(code="SUB-001", name="Sub 1", item_type="intermediate")
        BillOfMaterial.objects.create(product=self.product_item, material=self.material_item1, quantity="1.500")
        BillOfMaterial.objects.create(product=self.product_item, material=self.sub_item, quantity="2.000")
        # 中間品の構成(2階層目)は計画の所要部品には含めない
        BillOfMaterial.objects.create(product=self.sub_item, material=self.material_item2, quantity="4.000")

    def _materials(self, plan):
        return {m.material_id: m for m in ProductionPlanMaterial.objects.filter(production_plan=plan)}

    def test_pp_mat_snap_01_created_from_direct_bom_children(self):
        plan = self.create_plan(planned_quantity=3)
        materials = self._materials(plan)
        self.assertEqual(set(materials), {self.material_item1.code, self.sub_item.code})
        self.assertEqual(materials[self.material_item1.code].quantity_per_unit, Decimal("1.500"))
        # 1.5 × 3 = 4.5 → 在庫は整数管理のため切り上げて5
        self.assertEqual(materials[self.material_item1.code].required_quantity, 5)
        self.assertEqual(materials[self.sub_item.code].required_quantity, 6)

    def test_pp_mat_snap_02_planned_quantity_change_recalculates(self):
        plan = self.create_plan(planned_quantity=3)
        plan.planned_quantity = 10
        plan.save()
        self.assertEqual(self._materials(plan)[self.material_item1.code].required_quantity, 15)

    def test_pp_mat_snap_03_plan_edits_survive_unrelated_save(self):
        """計画ごとに編集した構成は、製品・計画数量以外の変更では上書きされない。"""
        plan = self.create_plan(planned_quantity=3)
        ProductionPlanMaterial.objects.filter(production_plan=plan, material=self.sub_item).delete()
        plan.plan_name = "renamed"
        plan.save()
        self.assertEqual(set(self._materials(plan)), {self.material_item1.code})

    def test_pp_mat_snap_04_product_change_resnapshots(self):
        plan = self.create_plan(planned_quantity=2)
        other_product = Item.objects.create(code="PROD-002", name="Product 2", item_type="product")
        BillOfMaterial.objects.create(product=other_product, material=self.material_item2, quantity="1.000")
        plan.product = other_product
        plan.save()
        self.assertEqual(set(self._materials(plan)), {self.material_item2.code})

    def test_pp_mat_snap_05_intermediate_can_be_planned(self):
        """中間品は自身の生産計画で作る。その所要部品は中間品のBOMから作られる。"""
        response = self.client.post(
            reverse("production_api:production-plan-list"),
            {
                "plan_name": "Sub plan",
                "product_code": self.sub_item.code,
                "planned_quantity": 2,
                "planned_start_datetime": "2026-10-01T09:00:00+09:00",
                "planned_end_datetime": "2026-10-01T17:00:00+09:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        materials = ProductionPlanMaterial.objects.filter(production_plan_id=response.data["id"])
        self.assertEqual([(m.material_id, m.required_quantity) for m in materials], [(self.material_item2.code, 8)])

    def test_pp_mat_snap_06_product_change_blocked_when_allocated(self):
        plan = self.create_plan(planned_quantity=2)
        self.create_material_allocation(production_plan=plan, material_code=self.material_item1.code)
        other_product = Item.objects.create(code="PROD-002", name="Product 2", item_type="product")
        response = self.client.patch(
            reverse("production_api:production-plan-detail", args=[plan.id]),
            {"product_code": other_product.code},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product_code", response.data["errors"])

    def test_pp_mat_snap_07_same_product_allowed_when_allocated(self):
        """製品を変えない更新(計画名や同じ製品コードの再送)は引当があっても許可する。"""
        plan = self.create_plan(planned_quantity=2)
        self.create_material_allocation(production_plan=plan, material_code=self.material_item1.code)
        response = self.client.patch(
            reverse("production_api:production-plan-detail", args=[plan.id]),
            {"product_code": self.product_item.code, "plan_name": "renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class PlanMaterialApiTests(ProductionAPITestBase):
    """PP-MAT-* : 生産計画の所要部品の編集 (plan-materials/, plans/{id}/reset-materials/)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan(planned_quantity=10)
        self.list_url = reverse("production_api:plan-material-list")
        self.pm = self.create_plan_material(self.plan, self.material_item1, quantity_per_unit="1")

    def _detail_url(self, pk):
        return reverse("production_api:plan-material-detail", args=[pk])

    def test_pp_mat_01_list_filtered_by_plan(self):
        other_plan = self.create_plan(plan_name="Other")
        self.create_plan_material(other_plan, self.material_item2)
        response = self.client.get(self.list_url, {"production_plan_id": str(self.plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual([r["material_code"] for r in rows], [self.material_item1.code])
        self.assertEqual(rows[0]["material_name"], self.material_item1.name)

    def test_pp_mat_02_add_material_computes_required_quantity(self):
        response = self.client.post(
            self.list_url,
            {
                "production_plan": str(self.plan.id),
                "material_code": self.material_item2.code,
                "quantity_per_unit": "0.25",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["required_quantity"], 3)  # 0.25 × 10 = 2.5 → 3

    def test_pp_mat_03_duplicate_material_rejected(self):
        response = self.client.post(
            self.list_url,
            {"production_plan": str(self.plan.id), "material_code": self.material_item1.code, "quantity_per_unit": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("material_code", response.data["errors"])

    def test_pp_mat_04_product_itself_rejected(self):
        """製品自身は材料・中間品ではないため部品として指定できない。"""
        response = self.client.post(
            self.list_url,
            {"production_plan": str(self.plan.id), "material_code": self.product_item.code, "quantity_per_unit": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_mat_04b_intermediate_plan_cannot_use_itself(self):
        sub = Item.objects.create(code="SUB-001", name="Sub 1", item_type="intermediate")
        plan = self.create_plan(plan_name="Sub plan", product_code=sub.code)
        response = self.client.post(
            self.list_url,
            {"production_plan": str(plan.id), "material_code": sub.code, "quantity_per_unit": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("製品自身", response.data["error"])

    def test_pp_mat_05_quantity_below_allocated_rejected(self):
        self.create_material_allocation(production_plan=self.plan, allocated_quantity=8)
        response = self.client.patch(self._detail_url(self.pm.id), {"quantity_per_unit": "0.5"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(self._detail_url(self.pm.id), {"quantity_per_unit": "0.8"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["required_quantity"], 8)

    def test_pp_mat_06_delete_allocated_material_rejected(self):
        self.create_material_allocation(production_plan=self.plan, allocated_quantity=1)
        response = self.client.delete(self._detail_url(self.pm.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(ProductionPlanMaterial.objects.filter(pk=self.pm.pk).exists())

    def test_pp_mat_07_delete_after_returned_allowed(self):
        self.create_material_allocation(production_plan=self.plan, allocated_quantity=1, status="RETURNED")
        response = self.client.delete(self._detail_url(self.pm.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_pp_mat_08_completed_plan_is_read_only(self):
        self.plan.status = "COMPLETED"
        self.plan.save()
        response = self.client.patch(self._detail_url(self.pm.id), {"quantity_per_unit": "2"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.delete(self._detail_url(self.pm.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_mat_09_reset_from_master(self):
        BillOfMaterial.objects.create(product=self.product_item, material=self.material_item2, quantity="2.000")
        url = reverse("production_api:production-plan-reset-materials", args=[self.plan.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([m["material_code"] for m in response.data["data"]], [self.material_item2.code])
        self.assertEqual(response.data["data"][0]["required_quantity"], 20)

    def test_pp_mat_10_reset_blocked_when_allocated(self):
        self.create_material_allocation(production_plan=self.plan, allocated_quantity=1)
        url = reverse("production_api:production-plan-reset-materials", args=[self.plan.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(ProductionPlanMaterial.objects.filter(pk=self.pm.pk).exists())


class PartsUsedMigrationTests(ProductionAPITestBase):
    """PP-MAT-MIG-* : 旧 PartsUsed から生産計画の所要部品への移行 (migrations/0010)。"""

    def _run_migration(self):
        module = importlib.import_module("production.migrations.0010_migrate_parts_used_to_plan_materials")
        module.forwards(apps, None)

    def test_pp_mat_mig_01_parts_used_copied_to_referencing_plans(self):
        plan_a = self.create_plan(plan_name="A", production_plan="BOM-1", planned_quantity=3)
        plan_b = self.create_plan(plan_name="B", production_plan="BOM-1", planned_quantity=4)
        self.create_plan(plan_name="C", production_plan="BOM-OTHER")
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, quantity_used=4)
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, quantity_used=6)
        PartsUsed.objects.create(production_plan="BOM-1", part=None, quantity_used=1)

        self._run_migration()

        for plan, per_unit in ((plan_a, Decimal("3.333")), (plan_b, Decimal("2.500"))):
            materials = list(ProductionPlanMaterial.objects.filter(production_plan=plan))
            self.assertEqual(len(materials), 1)
            # 所要数量(計画全体)は元の合計数量をそのまま引き継ぐ
            self.assertEqual(materials[0].required_quantity, 10)
            self.assertEqual(materials[0].quantity_per_unit, per_unit)
        self.assertEqual(ProductionPlanMaterial.objects.filter(production_plan__plan_name="C").count(), 0)

    def test_pp_mat_mig_02_plans_with_materials_are_skipped(self):
        plan = self.create_plan(production_plan="BOM-1")
        self.create_plan_material(plan, self.material_item2)
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, quantity_used=4)

        self._run_migration()

        self.assertEqual(
            list(ProductionPlanMaterial.objects.filter(production_plan=plan).values_list("material_id", flat=True)),
            [self.material_item2.code],
        )
