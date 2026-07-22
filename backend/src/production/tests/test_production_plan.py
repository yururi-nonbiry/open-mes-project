from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from ..models import ProductionPlan
from .test_helpers import ProductionAPITestBase


class ProductionPlanCrudTests(ProductionAPITestBase):
    """PP-CRUD-* : 生産計画CRUD・検索 (ProductionPlanViewSet 標準機能)。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("production_api:production-plan-list")
        self.plan = self.create_plan(plan_name="Alpha Plan")

    def _detail_url(self, plan_id):
        return reverse("production_api:production-plan-detail", args=[plan_id])

    def test_pp_crud_01_list(self):
        self.create_plan(plan_name="Beta Plan")
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)

    def test_pp_crud_02_create(self):
        now = timezone.now()
        payload = {
            "plan_name": "New Plan",
            "product_code": self.product_item.code,
            "planned_quantity": 5,
            "planned_start_datetime": now.isoformat(),
            "planned_end_datetime": (now + timezone.timedelta(hours=2)).isoformat(),
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ProductionPlan.objects.filter(plan_name="New Plan").exists())

    def test_pp_crud_03_start_after_end_rejected(self):
        now = timezone.now()
        payload = {
            "plan_name": "Bad Plan",
            "product_code": self.product_item.code,
            "planned_quantity": 5,
            "planned_start_datetime": now.isoformat(),
            "planned_end_datetime": (now - timezone.timedelta(hours=1)).isoformat(),
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_crud_04_partial_update_remarks_only(self):
        response = self.client.patch(self._detail_url(self.plan.id), {"remarks": "updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.remarks, "updated")
        self.assertEqual(self.plan.plan_name, "Alpha Plan")

    def test_pp_crud_05_partial_update_start_after_existing_end_rejected(self):
        new_start = self.plan.planned_end_datetime + timezone.timedelta(hours=1)
        response = self.client.patch(
            self._detail_url(self.plan.id), {"planned_start_datetime": new_start.isoformat()}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_crud_06_search_plan_name(self):
        self.create_plan(plan_name="Beta Plan")
        response = self.client.get(self.list_url, {"plan_name": "Alpha"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["plan_name"], "Alpha Plan")

    def test_pp_crud_07_search_status_in(self):
        self.create_plan(plan_name="Beta Plan", status="COMPLETED")
        self.create_plan(plan_name="Gamma Plan", status="CANCELLED")
        response = self.client.get(self.list_url, {"status__in": "PENDING,COMPLETED"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {r["plan_name"] for r in response.data["results"]}
        self.assertEqual(names, {"Alpha Plan", "Beta Plan"})

    def test_pp_crud_08_ordering_by_product_code_translated(self):
        response = self.client.get(self.list_url, {"ordering": "product_code"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pp_crud_09_search_planned_start_range(self):
        base = self.plan.planned_start_datetime
        response = self.client.get(
            self.list_url,
            {
                "planned_start_datetime_after": (base - timezone.timedelta(minutes=1)).isoformat(),
                "planned_start_datetime_before": (base + timezone.timedelta(minutes=1)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)


class RequiredPartsTests(ProductionAPITestBase):
    """PP-REQ-* : 必要部品リスト取得アクション (GET plans/{id}/required-parts/)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan(production_plan="BOM-1")
        self.url = reverse("production_api:production-plan-required-parts", args=[self.plan.id])

    def test_pp_req_01_returns_bom_parts(self):
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, quantity_used=5)
        self.create_inventory(part_number=self.material_item1.code, quantity=20)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["part_code"], self.material_item1.code)
        self.assertEqual(response.data[0]["required_quantity"], 5)
        self.assertEqual(response.data[0]["inventory_quantity"], 20)

    def test_pp_req_02_no_bom_returns_empty(self):
        plan_without_bom = self.create_plan(production_plan=None)
        url = reverse("production_api:production-plan-required-parts", args=[plan_without_bom.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_pp_req_03_specific_warehouse_only(self):
        self.create_parts_used(
            production_plan="BOM-1", part_code=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number
        )
        self.create_inventory(
            part_number=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=7
        )
        self.create_inventory(
            part_number=self.material_item1.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=100,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["inventory_quantity"], 7)

    def test_pp_req_04_no_warehouse_sums_all(self):
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code, warehouse=None)
        self.create_inventory(
            part_number=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=7
        )
        self.create_inventory(
            part_number=self.material_item1.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=3,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["inventory_quantity"], 10)

    def test_pp_req_05_already_allocated_quantity_reflected(self):
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code)
        self.create_material_allocation(
            production_plan=self.plan, material_code=self.material_item1.code, allocated_quantity=4
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["already_allocated_quantity"], 4)

    def test_pp_req_06_inactive_inventory_excluded(self):
        self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code)
        self.create_inventory(part_number=self.material_item1.code, quantity=20, is_active=False)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["inventory_quantity"], 0)
