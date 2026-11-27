"""一覧APIのクエリ数が件数に比例しない(N+1 にならない)ことの確認 (BASE-QCOUNT-*)。"""
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from inventory.models import PurchaseOrder, SalesOrder, StockMovement
from master.models import Item, StockPurpose, Supplier, Warehouse, WorkCenter
from production.models import MaterialAllocation, ProductionPlan

User = get_user_model()


class ListQueryCountTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(custom_id="qc", password="pw", username="qc", is_staff=True)
        self.client.force_authenticate(self.user)
        self.product = Item.objects.create(code="QC-PROD", name="P", item_type="product")
        self.material = Item.objects.create(code="QC-MAT", name="M", item_type="material")
        self.warehouse = Warehouse.objects.create(warehouse_number="QC-WH", name="W")
        self.supplier = Supplier.objects.create(supplier_number="QC-SUP", name="S")
        self.purpose = StockPurpose.objects.create(code="QC-PUR", name="用途")
        self.line = WorkCenter.objects.create(code="QC-LINE", name="L")
        self.n = 0

    def _add_rows(self, count):
        now = timezone.now()
        for _ in range(count):
            self.n += 1
            n = self.n
            StockMovement.objects.create(
                part_number=self.material.code, warehouse=self.warehouse.warehouse_number, quantity=1,
                movement_type="incoming", purpose=self.purpose.code, line=self.line.code, operator=self.user,
            )
            PurchaseOrder.objects.create(
                order_number=f"QC-PO-{n}", part_number=self.material.code, supplier=self.supplier.supplier_number,
                warehouse=self.warehouse.warehouse_number, purpose=self.purpose.code, quantity=1,
            )
            SalesOrder.objects.create(
                order_number=f"QC-SO-{n}", item=self.material.code, warehouse=self.warehouse.warehouse_number,
                purpose=self.purpose.code, line=self.line.code, quantity=1,
            )
            plan = ProductionPlan.objects.create(
                plan_name=f"QC-PLAN-{n}", product=self.product, purpose=self.purpose.code, line=self.line.code,
                planned_quantity=1, planned_start_datetime=now, planned_end_datetime=now + timezone.timedelta(hours=1),
            )
            MaterialAllocation.objects.create(
                production_plan=plan, material_code=self.material.code, warehouse=self.warehouse.warehouse_number,
                purpose=self.purpose.code, line=self.line.code, allocated_quantity=1,
            )

    def _count(self, url):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url, {"page_size": 100})
        self.assertEqual(response.status_code, 200, response.content)
        return len(ctx.captured_queries)

    def test_base_qcount_01_list_queries_do_not_grow_with_rows(self):
        urls = [
            reverse("inventory_api:stockmovement-list"),
            reverse("inventory_api:purchaseorder-list"),
            reverse("inventory_api:salesorder-list"),
            reverse("inventory_api:inventory-list"),
            reverse("production_api:production-plan-list"),
            reverse("production_api:material-allocation-list"),
        ]
        self._add_rows(2)
        before = {url: self._count(url) for url in urls}
        self._add_rows(5)
        after = {url: self._count(url) for url in urls}
        self.assertEqual(after, before)

    def test_base_qcount_02_allocation_overview_queries_do_not_grow_with_plans(self):
        """一覧の引当状況(allocation-overview)は、計画の件数によらず一定回数のクエリで返す。"""
        from production.models import ProductionPlanMaterial

        def overview_queries():
            plans = list(ProductionPlan.objects.all())
            for plan in plans:
                ProductionPlanMaterial.objects.get_or_create(
                    production_plan=plan, material=self.material, defaults={"quantity_per_unit": 1, "required_quantity": 1}
                )
            ids = ",".join(str(p.pk) for p in plans)
            url = reverse("production_api:production-plan-allocation-overview")
            with CaptureQueriesContext(connection) as ctx:
                response = self.client.get(url, {"ids": ids})
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(len(response.json()), len(plans))
            return len(ctx.captured_queries)

        self._add_rows(2)
        before = overview_queries()
        self._add_rows(5)
        self.assertEqual(overview_queries(), before)
