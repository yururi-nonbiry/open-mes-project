from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from master.models import BillOfMaterial, Item

from ..models import ProductionPlan, ProductionPlanMaterial
from .test_helpers import ProductionAPITestBase


class IntermediatePlanTests(ProductionAPITestBase):
    """
    PP-INT-* : 中間品の子計画の自動作成と手配方法の選択。

    構成: PROD-001 ← INT-001 ×2, MAT-001 ×1 / INT-001 ← MAT-002 ×3
    """

    def setUp(self):
        super().setUp()
        self.intermediate = Item.objects.create(
            code="INT-001", name="Intermediate 1", item_type="intermediate", lead_time_days=2
        )
        BillOfMaterial.objects.create(product=self.product_item, material=self.intermediate, quantity=2)
        BillOfMaterial.objects.create(product=self.product_item, material=self.material_item1, quantity=1)
        BillOfMaterial.objects.create(product=self.intermediate, material=self.material_item2, quantity=3)
        self.start = timezone.now() + timedelta(days=10)

    def _plan(self, **kwargs):
        kwargs.setdefault("planned_start_datetime", self.start)
        kwargs.setdefault("planned_end_datetime", kwargs["planned_start_datetime"] + timedelta(hours=8))
        return self.create_plan(**kwargs)

    def _stock(self, quantity):
        return self.create_inventory(part_number=self.intermediate.code, quantity=quantity)

    def _requirements(self, plan):
        url = reverse("production_api:production-plan-intermediate-requirements", args=[plan.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["material_code"]: row for row in response.data}

    def _arrange(self, plan, decisions):
        url = reverse("production_api:production-plan-arrange-intermediates", args=[plan.id])
        return self.client.post(url, {"decisions": decisions}, format="json")

    def _plan_material(self, plan):
        return ProductionPlanMaterial.objects.get(production_plan=plan, material=self.intermediate)

    def test_pp_int_01_child_plan_created_for_shortage(self):
        """在庫がなければ、中間品の所要数(10×2)を作る子計画が親の開始までに終わるよう作られる。"""
        plan = self._plan(planned_quantity=10)
        child = ProductionPlan.objects.get(parent_plan=plan)
        self.assertEqual(child.product_id, self.intermediate.code)
        self.assertEqual(child.planned_quantity, 20)
        self.assertEqual(child.status, "PENDING")
        self.assertEqual(child.planned_end_datetime, plan.planned_start_datetime)
        self.assertEqual(child.planned_start_datetime, plan.planned_start_datetime - timedelta(days=2))
        self.assertEqual(
            list(child.materials.values_list("material_id", "required_quantity")), [(self.material_item2.code, 60)]
        )
        self.assertEqual(self._plan_material(plan).supply_method, "CHILD_PLAN")
        self.assertEqual(self._requirements(plan)[self.intermediate.code]["status"], "COVERED")

    def test_pp_int_02_child_plan_only_for_the_shortfall(self):
        self._stock(15)
        plan = self._plan(planned_quantity=10)
        self.assertEqual(ProductionPlan.objects.get(parent_plan=plan).planned_quantity, 5)

    def test_pp_int_03_surplus_stock_requires_decision(self):
        """在庫で足りる場合は子計画を作らず、子計画か在庫かの選択待ちになる。"""
        self._stock(30)
        plan = self._plan(planned_quantity=10)
        self.assertFalse(ProductionPlan.objects.filter(parent_plan=plan).exists())
        row = self._requirements(plan)[self.intermediate.code]
        self.assertEqual(row["status"], "DECISION_REQUIRED")
        self.assertEqual(row["projected_available_quantity"], 30)
        self.assertEqual(row["uncovered_quantity"], 20)
        response = self.client.get(reverse("production_api:production-plan-detail", args=[plan.id]))
        self.assertEqual(response.data["pending_intermediate_count"], 1)

    def test_pp_int_04_decide_to_use_stock(self):
        self._stock(30)
        plan = self._plan(planned_quantity=10)
        response = self._arrange(plan, [{"material_code": self.intermediate.code, "method": "STOCK"}])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["created_plans"], [])
        self.assertEqual(response.data["data"]["requirements"][0]["status"], "COVERED")
        self.assertEqual(self._plan_material(plan).supply_method, "STOCK")
        response = self.client.get(reverse("production_api:production-plan-detail", args=[plan.id]))
        self.assertEqual(response.data["pending_intermediate_count"], 0)

    def test_pp_int_05_decide_to_create_child_plan(self):
        """子計画を選んだ場合、数量省略時はまだ賄えていない数量(20)で作る。"""
        self._stock(30)
        plan = self._plan(planned_quantity=10)
        response = self._arrange(plan, [{"material_code": self.intermediate.code, "method": "CHILD_PLAN"}])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["created_plans"][0]["planned_quantity"], 20)
        self.assertEqual(response.data["data"]["created_plans"][0]["parent_plan"], plan.id)
        row = response.data["data"]["requirements"][0]
        self.assertEqual((row["status"], row["child_planned_quantity"]), ("COVERED", 20))

        response = self._arrange(
            plan, [{"material_code": self.intermediate.code, "method": "CHILD_PLAN", "quantity": 4}]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, "数量を指定すれば追加で作れる")
        self.assertEqual(ProductionPlan.objects.filter(parent_plan=plan).count(), 2)

    def test_pp_int_06_stock_rejected_when_short(self):
        inventory = self._stock(30)
        plan = self._plan(planned_quantity=10)
        inventory.quantity = 5
        inventory.save()
        self.assertEqual(self._requirements(plan)[self.intermediate.code]["shortage_quantity"], 15)
        response = self._arrange(plan, [{"material_code": self.intermediate.code, "method": "STOCK"}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_int_07_earlier_plans_demand_reduces_projection(self):
        """先に始まる計画の未引当の所要数は、在庫の見込みから差し引かれる。"""
        self._stock(30)
        self._plan(plan_name="Earlier", planned_quantity=10)
        later = self._plan(plan_name="Later", planned_quantity=10, planned_start_datetime=self.start + timedelta(days=1))
        self.assertEqual(ProductionPlan.objects.get(parent_plan=later).planned_quantity, 10)

    def test_pp_int_08_other_production_counts_as_supply(self):
        """親の開始までに終わる他の生産予定(子計画以外)も見込みに数える。"""
        self.create_plan(
            plan_name="Standalone INT",
            product_code=self.intermediate.code,
            planned_quantity=20,
            planned_start_datetime=self.start - timedelta(days=3),
            planned_end_datetime=self.start - timedelta(days=1),
        )
        plan = self._plan(planned_quantity=10)
        self.assertFalse(ProductionPlan.objects.filter(parent_plan=plan).exists())
        self.assertEqual(self._requirements(plan)[self.intermediate.code]["status"], "DECISION_REQUIRED")

    def test_pp_int_09_multi_level_grandchild_plan(self):
        """中間品の子計画が使う中間品も不足していれば、孫計画が作られる。"""
        sub = Item.objects.create(code="INT-002", name="Intermediate 2", item_type="intermediate")
        BillOfMaterial.objects.create(product=self.intermediate, material=sub, quantity=1)
        plan = self._plan(planned_quantity=10)
        child = ProductionPlan.objects.get(parent_plan=plan)
        grandchild = ProductionPlan.objects.get(parent_plan=child)
        self.assertEqual((grandchild.product_id, grandchild.planned_quantity), (sub.code, 20))
        self.assertEqual(grandchild.planned_end_datetime, child.planned_start_datetime)

    def test_pp_int_10_quantity_increase_adds_child_plan(self):
        self._stock(30)
        plan = self._plan(planned_quantity=10)
        response = self.client.patch(
            reverse("production_api:production-plan-detail", args=[plan.id]), {"planned_quantity": 20}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(ProductionPlan.objects.get(parent_plan=plan).planned_quantity, 10)

    def test_pp_int_11_adding_intermediate_to_plan_materials(self):
        """計画の部品構成に中間品を追加して不足した場合も子計画が作られる。"""
        other = Item.objects.create(code="INT-003", name="Intermediate 3", item_type="intermediate")
        plan = self._plan(planned_quantity=10)
        response = self.client.post(
            reverse("production_api:plan-material-list"),
            {"production_plan": str(plan.id), "material_code": other.code, "quantity_per_unit": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ProductionPlan.objects.filter(parent_plan=plan, product_id=other.code).exists())

    def test_pp_int_12_invalid_decisions_rejected(self):
        self._stock(30)
        plan = self._plan(planned_quantity=10)
        code = self.intermediate.code
        for decisions in (
            [],
            [{"material_code": self.material_item1.code, "method": "STOCK"}],
            [{"material_code": code, "method": "XXX"}],
            [{"material_code": code, "method": "CHILD_PLAN", "quantity": 0}],
            [{"material_code": code, "method": "CHILD_PLAN", "quantity": "abc"}],
        ):
            response = self._arrange(plan, decisions)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, decisions)
        self.assertFalse(ProductionPlan.objects.filter(parent_plan=plan).exists())

        plan.status = "COMPLETED"
        plan.save()
        response = self._arrange(plan, [{"material_code": code, "method": "STOCK"}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
