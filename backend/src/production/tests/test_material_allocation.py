from django.urls import reverse
from rest_framework import status

from inventory.models import SalesOrder, StockMovement

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class MaterialAllocationCrudTests(ProductionAPITestBase):
    """MA-CRUD-* : 材料引当CRUD (MaterialAllocationViewSet 標準機能)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan()
        self.list_url = reverse("production_api:material-allocation-list")
        self.allocation = self.create_material_allocation(production_plan=self.plan)

    def _detail_url(self, allocation_id):
        return reverse("production_api:material-allocation-detail", args=[allocation_id])

    def test_ma_crud_01_list(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_ma_crud_02_search_production_plan_id(self):
        other_plan = self.create_plan(plan_name="Other Plan")
        self.create_material_allocation(production_plan=other_plan, material_code=self.material_item2.code)
        response = self.client.get(self.list_url, {"production_plan_id": str(self.plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_ma_crud_03_status_is_read_only(self):
        response = self.client.patch(self._detail_url(self.allocation.id), {"status": "ISSUED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.allocation.refresh_from_db()
        self.assertEqual(self.allocation.status, "ALLOCATED")


class MaterialAllocationDeleteTests(ProductionAPITestBase):
    """MA-DEL-* : 材料引当削除 (destroy override -> release_material_allocation_service)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan()
        self.inventory = self.create_inventory(quantity=10, reserved=5)
        self.allocation = self.create_material_allocation(production_plan=self.plan, allocated_quantity=5)

    def _detail_url(self, allocation_id):
        return reverse("production_api:material-allocation-detail", args=[allocation_id])

    def test_ma_del_01_allocated_can_be_deleted(self):
        response = self.client.delete(self._detail_url(self.allocation.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved, 0)
        self.assertFalse(MaterialAllocation.objects.filter(id=self.allocation.id).exists())

    def test_ma_del_02_issued_cannot_be_deleted(self):
        self.allocation.status = "ISSUED"
        self.allocation.save()
        response = self.client.delete(self._detail_url(self.allocation.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(MaterialAllocation.objects.filter(id=self.allocation.id).exists())

    def test_ma_del_03_returned_cannot_be_deleted(self):
        self.allocation.status = "RETURNED"
        self.allocation.save()
        response = self.client.delete(self._detail_url(self.allocation.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MaterialAllocationChangeStatusTests(ProductionAPITestBase):
    """MA-STATUS-* : 材料引当ステータス変更 (POST material-allocations/{id}/change-status/)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan()
        self.inventory = self.create_inventory(quantity=10, reserved=5)
        self.allocation = self.create_material_allocation(production_plan=self.plan, allocated_quantity=5)
        self.url = reverse("production_api:material-allocation-change-status", args=[self.allocation.id])

    def test_ma_status_01_allocated_to_issued(self):
        # change-statusはSalesOrderを新規作成せず既存の内部SOを更新するのみのため、
        # allocate_materials_service相当の内部SO(INT-プレフィックス)を先に用意しておく。
        so_number = f"INT-{self.allocation.id.hex[-15:]}"
        SalesOrder.objects.create(
            order_number=so_number,
            item=self.allocation.material_code,
            warehouse=self.allocation.warehouse,
            quantity=self.allocation.allocated_quantity,
            status="pending",
        )
        response = self.client.post(self.url, {"status": "ISSUED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 5)
        self.assertEqual(self.inventory.reserved, 0)
        self.allocation.refresh_from_db()
        self.assertEqual(self.allocation.status, "ISSUED")
        self.assertTrue(StockMovement.objects.filter(movement_type="used").exists())
        so = SalesOrder.objects.get(order_number=so_number)
        self.assertEqual(so.status, "shipped")

    def test_ma_status_02_insufficient_stock_rejected(self):
        self.inventory.quantity = 2
        self.inventory.save()
        response = self.client.post(self.url, {"status": "ISSUED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ma_status_03_issued_to_returned(self):
        self.allocation.status = "ISSUED"
        self.allocation.save()
        self.inventory.quantity = 5
        self.inventory.reserved = 0
        self.inventory.save()
        response = self.client.post(self.url, {"status": "RETURNED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)
        self.assertEqual(self.inventory.reserved, 0, "引当解除済みのためreservedは戻さない")
        self.assertTrue(StockMovement.objects.filter(movement_type="incoming").exists())

    def test_ma_status_04_allocated_to_returned_rejected(self):
        response = self.client.post(self.url, {"status": "RETURNED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ma_status_05_missing_status_rejected(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ma_status_06_no_warehouse_rejected(self):
        self.allocation.warehouse = None
        self.allocation.save()
        response = self.client.post(self.url, {"status": "ISSUED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
