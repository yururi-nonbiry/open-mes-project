from django.urls import reverse
from rest_framework import status

from inventory.models import StockMovement

from ..models import MaterialAllocation
from .test_helpers import ProductionAPITestBase


class AdditionalIssueTests(ProductionAPITestBase):
    """PP-ADDISSUE-* : 歩留まり・ロス等の不足分の追加出庫 (POST plans/{id}/issue-additional-materials/)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan(status="IN_PROGRESS", planned_quantity=10)
        self.create_plan_material(self.plan, self.material_item1)
        self.inventory = self.create_inventory(quantity=10, reserved=6)
        self.url = reverse("production_api:production-plan-issue-additional-materials", args=[self.plan.id])

    def _item(self, quantity, part_number=None):
        return {
            "part_number": part_number or self.material_item1.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "quantity": quantity,
        }

    def test_pp_addissue_01_issued_immediately_from_unreserved_stock(self):
        response = self.client.post(self.url, {"items": [self._item(3)], "remarks": "ロス補填"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 7)
        self.assertEqual(self.inventory.reserved, 6, "他の引当分には手を付けない")
        allocation = MaterialAllocation.objects.get(production_plan=self.plan)
        self.assertEqual(allocation.allocation_type, "ADDITIONAL")
        self.assertEqual(allocation.status, "ISSUED")
        self.assertEqual(allocation.remarks, "ロス補填")
        self.assertEqual(response.data["data"][0]["allocation_type_display"], "追加出庫")
        self.assertTrue(
            StockMovement.objects.filter(
                reference_document=f"MaterialAllocation-{allocation.id}", movement_type="used", quantity=3
            ).exists()
        )

    def test_pp_addissue_02_not_counted_against_requirement(self):
        """追加出庫しても、所要量(10)に対する通常の引当は満額できる。"""
        self.client.post(self.url, {"items": [self._item(3)]}, format="json")
        self.inventory.quantity = 20
        self.inventory.reserved = 0
        self.inventory.save()
        allocate_url = reverse("production_api:production-plan-allocate-materials", args=[self.plan.id])
        response = self.client.post(
            allocate_url,
            {
                "allocations": [
                    {
                        "part_number": self.material_item1.code,
                        "warehouse": self.warehouse_a.warehouse_number,
                        "quantity_to_allocate": 10,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pp_addissue_03_insufficient_unreserved_stock_rolls_back(self):
        second = self.create_inventory(part_number=self.material_item2.code, quantity=5)
        self.create_plan_material(self.plan, self.material_item2)
        response = self.client.post(
            self.url, {"items": [self._item(2, self.material_item2.code), self._item(5)]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        second.refresh_from_db()
        self.assertEqual(second.quantity, 5, "1件目もロールバックされること")
        self.assertFalse(MaterialAllocation.objects.filter(production_plan=self.plan).exists())

    def test_pp_addissue_04_part_not_in_plan_materials_rejected(self):
        self.create_inventory(part_number=self.material_item2.code, quantity=5)
        response = self.client.post(self.url, {"items": [self._item(1, self.material_item2.code)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_addissue_05_invalid_input_rejected(self):
        for body in ({"items": []}, {"items": "x"}, {"items": [self._item(0)]}, {"items": [self._item("abc")]}):
            response = self.client.post(self.url, body, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, body)

    def test_pp_addissue_06_cancelled_plan_rejected(self):
        self.plan.status = "CANCELLED"
        self.plan.save()
        response = self.client.post(self.url, {"items": [self._item(1)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_addissue_07_completion_reversal_keeps_additional_issued(self):
        """生産完了の取消で通常の引当は引当状態に戻るが、追加出庫は実際に使った分のため戻さない。"""
        self.client.post(self.url, {"items": [self._item(2)]}, format="json")
        progress_url = reverse("production_api:production-plan-update-progress", args=[self.plan.id])
        self.client.post(progress_url, {"status": "COMPLETED", "good_quantity": 0}, format="json")
        response = self.client.post(progress_url, {"status": "IN_PROGRESS"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        additional = MaterialAllocation.objects.get(production_plan=self.plan, allocation_type="ADDITIONAL")
        self.assertEqual(additional.status, "ISSUED")
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 8)

    def test_pp_addissue_08_can_be_returned(self):
        """使わなかった追加出庫分は、通常の引当と同じく返却(ISSUED → RETURNED)で在庫に戻せる。"""
        self.client.post(self.url, {"items": [self._item(2)]}, format="json")
        allocation = MaterialAllocation.objects.get(production_plan=self.plan)
        url = reverse("production_api:material-allocation-change-status", args=[allocation.id])
        response = self.client.post(url, {"status": "RETURNED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 10)
