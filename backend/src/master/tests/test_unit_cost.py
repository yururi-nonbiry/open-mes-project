from django.urls import reverse
from rest_framework import status

from ..models import UnitCost
from .test_helpers import MasterAPITestBase


class UnitCostCrudTests(MasterAPITestBase):
    """MST-UC-* : UnitCostViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:unit-cost-list")
        self.item = self.create_item(code="ITEM-A")
        self.unit_cost = self.create_unit_cost(item=self.item, cost="50.00")

    def _detail_url(self, unit_cost_id):
        return reverse("master_api:unit-cost-detail", args=[unit_cost_id])

    def test_mst_uc_01_create_success(self):
        other_item = self.create_item(code="ITEM-B", name="テスト品目B")
        payload = {"item": other_item.code, "cost": "75.50"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(UnitCost.objects.filter(item=other_item).exists())

    def test_mst_uc_02_duplicate_item_rejected(self):
        payload = {"item": self.item.code, "cost": "99.99"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_uc_03_unknown_item_code_rejected(self):
        payload = {"item": "NOPE-999", "cost": "1.00"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_uc_04_update_cost(self):
        response = self.client.patch(self._detail_url(self.unit_cost.id), {"cost": "60.00"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.unit_cost.refresh_from_db()
        self.assertEqual(str(self.unit_cost.cost), "60.00")

    def test_mst_uc_05_list_shows_item_code(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"][0]["item"], self.item.code)

    def test_mst_uc_06_delete_success(self):
        response = self.client.delete(self._detail_url(self.unit_cost.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(UnitCost.objects.filter(id=self.unit_cost.id).exists())
