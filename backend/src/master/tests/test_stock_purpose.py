from django.urls import reverse
from rest_framework import status

from inventory.models import Inventory

from ..models import StockPurpose
from .test_helpers import MasterAPITestBase


class StockPurposeCrudTests(MasterAPITestBase):
    """MST-SP-* : StockPurposeViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:stock-purpose-list")
        self.purpose = StockPurpose.objects.create(code="PRD-A", name="A製品用")

    def _detail_url(self, pk):
        return reverse("master_api:stock-purpose-detail", args=[pk])

    def test_mst_sp_01_create_success(self):
        response = self.client.post(self.list_url, {"code": "MNT", "name": "保守用"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(StockPurpose.objects.get(code="MNT").is_active)

    def test_mst_sp_02_duplicate_code_rejected(self):
        response = self.client.post(self.list_url, {"code": "PRD-A", "name": "別名"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_sp_03_update_code_is_read_only(self):
        response = self.client.patch(self._detail_url(self.purpose.id), {"code": "X", "name": "改名"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.purpose.refresh_from_db()
        self.assertEqual(self.purpose.code, "PRD-A")
        self.assertEqual(self.purpose.name, "改名")

    def test_mst_sp_04_delete_unused_purpose(self):
        response = self.client.delete(self._detail_url(self.purpose.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(StockPurpose.objects.filter(code="PRD-A").exists())

    def test_mst_sp_05_delete_in_use_purpose_rejected(self):
        item = self.create_item()
        warehouse = self.create_warehouse()
        Inventory.objects.create(
            part_number=item.code, warehouse=warehouse.warehouse_number, location="A-01", purpose="PRD-A", quantity=1
        )
        response = self.client.delete(self._detail_url(self.purpose.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(StockPurpose.objects.filter(code="PRD-A").exists())
