from django.urls import reverse
from rest_framework import status

from ..models import WarehouseLocation
from .test_helpers import MasterAPITestBase


class WarehouseLocationCrudTests(MasterAPITestBase):
    """MST-WHLOC-* : WarehouseLocationViewSet CRUD・倉庫番号によるフィルタ。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:warehouse-location-list")
        self.warehouse_a = self.create_warehouse(warehouse_number="WH-A", name="倉庫A")
        self.warehouse_b = self.create_warehouse(warehouse_number="WH-B", name="倉庫B")
        self.location = self.create_warehouse_location(warehouse=self.warehouse_a, code="A-01")

    def _detail_url(self, location_id):
        return reverse("master_api:warehouse-location-detail", args=[location_id])

    def test_mst_whloc_01_list_all(self):
        self.create_warehouse_location(warehouse=self.warehouse_b, code="B-01")
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 2)

    def test_mst_whloc_02_filter_by_warehouse(self):
        self.create_warehouse_location(warehouse=self.warehouse_b, code="B-01")
        response = self.client.get(self.list_url, {"warehouse": "WH-A"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["code"], "A-01")

    def test_mst_whloc_03_create_success(self):
        payload = {"warehouse": "WH-A", "code": "A-02", "pos_x": 1, "pos_y": 0}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(WarehouseLocation.objects.filter(warehouse=self.warehouse_a, code="A-02").exists())

    def test_mst_whloc_04_duplicate_code_within_same_warehouse_rejected(self):
        payload = {"warehouse": "WH-A", "code": "A-01", "pos_x": 5, "pos_y": 5}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_whloc_05_same_code_in_different_warehouse_allowed(self):
        payload = {"warehouse": "WH-B", "code": "A-01", "pos_x": 0, "pos_y": 0}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_mst_whloc_06_unknown_warehouse_number_rejected(self):
        payload = {"warehouse": "WH-NOPE", "code": "X-01", "pos_x": 0, "pos_y": 0}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_whloc_07_delete_success(self):
        response = self.client.delete(self._detail_url(self.location.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(WarehouseLocation.objects.filter(id=self.location.id).exists())
