from django.urls import reverse
from rest_framework import status

from ..models import Warehouse, WarehouseLocation
from .test_helpers import MasterAPITestBase


class WarehouseCrudTests(MasterAPITestBase):
    """MST-WH-* : WarehouseViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:warehouse-list")
        self.warehouse = self.create_warehouse()

    def _detail_url(self, warehouse_id):
        return reverse("master_api:warehouse-detail", args=[warehouse_id])

    def test_mst_wh_01_create_success_with_default_layout(self):
        payload = {"warehouse_number": "WH-NEW", "name": "新倉庫"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Warehouse.objects.get(warehouse_number="WH-NEW")
        self.assertEqual(created.layout_cols, 20)
        self.assertEqual(created.layout_rows, 20)

    def test_mst_wh_02_duplicate_warehouse_number_rejected(self):
        payload = {"warehouse_number": self.warehouse.warehouse_number, "name": "別名"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_wh_03_update_warehouse_number_is_read_only(self):
        response = self.client.patch(
            self._detail_url(self.warehouse.id), {"warehouse_number": "CHANGED"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.warehouse.refresh_from_db()
        self.assertNotEqual(self.warehouse.warehouse_number, "CHANGED")

    def test_mst_wh_04_update_layout_dimensions(self):
        response = self.client.patch(
            self._detail_url(self.warehouse.id), {"layout_cols": 10, "layout_rows": 5}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.warehouse.refresh_from_db()
        self.assertEqual(self.warehouse.layout_cols, 10)
        self.assertEqual(self.warehouse.layout_rows, 5)

    def test_mst_wh_05_delete_cascades_to_locations(self):
        location = self.create_warehouse_location(warehouse=self.warehouse)
        response = self.client.delete(self._detail_url(self.warehouse.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(WarehouseLocation.objects.filter(id=location.id).exists())
