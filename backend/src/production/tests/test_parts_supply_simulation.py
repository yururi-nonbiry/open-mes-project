"""共通部品を考慮した複数生産計画の供給シミュレーション (PSS-*) のテスト。"""
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from .test_helpers import ProductionAPITestBase


class PartsSupplySimulationTests(ProductionAPITestBase):
    def setUp(self):
        super().setUp()
        self.url = reverse("production_api:parts-supply-simulation")
        self.now = timezone.now()

    def test_pss_01_single_plan_within_stock_is_feasible(self):
        """PSS-01: 単独計画で在庫内に収まる場合は feasible=True。"""
        plan = self.create_plan(
            planned_start_datetime=self.now, status="PENDING"
        )
        self.create_plan_material(plan, required_quantity=5)
        self.create_inventory(part_number=self.material_item1.code, quantity=10, reserved=0)

        response = self.client.get(self.url, {"plan_ids": str(plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["plans"]), 1)
        self.assertTrue(response.data["plans"][0]["feasible"])
        self.assertEqual(response.data["parts"][0]["shortage_quantity"], 0)

    def test_pss_02_common_part_shortage_across_two_plans(self):
        """
        PSS-02: A・B2計画が共通部品を必要とし、在庫が両方を賄えない場合、
        納期が後の計画が feasible=False になり、不足数量・不足発生計画が記録される。
        """
        common_part = self.material_item1.code
        self.create_inventory(part_number=common_part, quantity=8, reserved=0)

        plan_a = self.create_plan(
            plan_name="Plan A", planned_start_datetime=self.now, status="PENDING",
        )
        self.create_plan_material(plan_a, required_quantity=5)

        plan_b = self.create_plan(
            plan_name="Plan B", planned_start_datetime=self.now + timezone.timedelta(days=5), status="PENDING",
        )
        self.create_plan_material(plan_b, required_quantity=5)

        response = self.client.get(self.url, {"plan_ids": f"{plan_a.id},{plan_b.id}"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        plans_by_name = {p["plan_name"]: p for p in response.data["plans"]}
        self.assertTrue(plans_by_name["Plan A"]["feasible"])
        self.assertFalse(plans_by_name["Plan B"]["feasible"])
        self.assertEqual(plans_by_name["Plan B"]["limiting_parts"][0]["part_code"], common_part)
        self.assertEqual(plans_by_name["Plan B"]["limiting_parts"][0]["shortage_quantity"], 2)

        part_summary = response.data["parts"][0]
        self.assertEqual(part_summary["part_code"], common_part)
        self.assertEqual(part_summary["total_required_quantity"], 10)
        self.assertEqual(part_summary["available_quantity"], 8)
        self.assertEqual(part_summary["shortage_quantity"], 2)
        self.assertEqual(part_summary["shortage_plan_id"], plan_b.id)

    def test_pss_03_already_allocated_quantity_is_netted_out(self):
        """PSS-03: 既に引当済の数量は不足判定から除外される。"""
        common_part = self.material_item1.code
        self.create_inventory(part_number=common_part, quantity=8, reserved=5)

        plan_a = self.create_plan(planned_start_datetime=self.now)
        self.create_plan_material(plan_a, required_quantity=5)
        self.create_material_allocation(production_plan=plan_a, material_code=common_part, allocated_quantity=5)

        response = self.client.get(self.url, {"plan_ids": str(plan_a.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["plans"][0]["feasible"])

    def test_pss_04_shortage_order_by_date_accounts_for_lead_time(self):
        """PSS-04: 不足発生日からリードタイム分をさかのぼった発注要否期限が算出される。"""
        common_part = self.material_item1.code
        self.material_item1.lead_time_days = 7
        self.material_item1.save(update_fields=["lead_time_days"])
        self.create_inventory(part_number=common_part, quantity=3, reserved=0)

        plan = self.create_plan(
            planned_start_datetime=self.now, status="PENDING",
        )
        self.create_plan_material(plan, required_quantity=5)

        response = self.client.get(self.url, {"plan_ids": str(plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        part_summary = response.data["parts"][0]
        self.assertEqual(part_summary["shortage_quantity"], 2)
        self.assertEqual(part_summary["lead_time_days"], 7)
        expected_order_by_date = self.now - timezone.timedelta(days=7)
        self.assertEqual(part_summary["order_by_date"], expected_order_by_date)
        # 計画開始日(now)から7日さかのぼった期限は既に過ぎているため、超過扱いになる。
        self.assertTrue(part_summary["order_overdue"])

    def test_pss_05_zero_lead_time_order_by_date_equals_shortage_date(self):
        """PSS-05: リードタイム未設定（0日）の場合、発注要否期限は不足発生日と一致する。"""
        common_part = self.material_item1.code
        self.create_inventory(part_number=common_part, quantity=3, reserved=0)

        plan = self.create_plan(
            planned_start_datetime=self.now + timezone.timedelta(days=30),
            status="PENDING",
        )
        self.create_plan_material(plan, required_quantity=5)

        response = self.client.get(self.url, {"plan_ids": str(plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        part_summary = response.data["parts"][0]
        self.assertEqual(part_summary["lead_time_days"], 0)
        self.assertEqual(part_summary["order_by_date"], part_summary["shortage_date"])
        self.assertFalse(part_summary["order_overdue"])

    def test_pss_06_stock_pooled_across_warehouses(self):
        """
        PSS-06: 所要部品は倉庫を持たない(引当時に選ぶ)ため、全倉庫の在庫を合算して判定し、
        合計が在庫を超えた時点で不足と判定される。
        """
        common_part = self.material_item1.code
        self.create_inventory(part_number=common_part, quantity=5, reserved=0)
        self.create_inventory(
            part_number=common_part, warehouse=self.warehouse_fg.warehouse_number, location="FG-01", quantity=3
        )

        plan_a = self.create_plan(plan_name="Plan A", planned_start_datetime=self.now, status="PENDING")
        self.create_plan_material(plan_a, required_quantity=5)
        plan_b = self.create_plan(
            plan_name="Plan B", planned_start_datetime=self.now + timezone.timedelta(days=5), status="PENDING"
        )
        self.create_plan_material(plan_b, required_quantity=5)

        response = self.client.get(self.url, {"plan_ids": f"{plan_a.id},{plan_b.id}"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plans_by_name = {p["plan_name"]: p for p in response.data["plans"]}
        self.assertTrue(plans_by_name["Plan A"]["feasible"])
        self.assertFalse(plans_by_name["Plan B"]["feasible"])
        self.assertEqual(plans_by_name["Plan B"]["limiting_parts"][0]["shortage_quantity"], 2)
        self.assertEqual(response.data["parts"][0]["available_quantity"], 8)

    def test_pss_07_additional_issue_not_counted_as_allocated(self):
        """PSS-07: 追加出庫は所要量の消化に数えない(所要量は通常引当でのみ満たされる)。"""
        self.create_inventory(part_number=self.material_item1.code, quantity=3, reserved=0)
        plan = self.create_plan(planned_start_datetime=self.now, status="IN_PROGRESS")
        self.create_plan_material(plan, required_quantity=5)
        self.create_material_allocation(
            production_plan=plan, allocated_quantity=5, status="ISSUED", allocation_type="ADDITIONAL"
        )

        response = self.client.get(self.url, {"plan_ids": str(plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["plans"][0]["feasible"])
        self.assertEqual(response.data["parts"][0]["shortage_quantity"], 2)
