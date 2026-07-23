from django.urls import reverse
from rest_framework import status

from ..models import WorkCenter
from .test_helpers import MasterAPITestBase


class WorkCenterCrudTests(MasterAPITestBase):
    """MST-WC-* : WorkCenterViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:work-center-list")
        self.work_center = self.create_work_center()

    def _detail_url(self, work_center_id):
        return reverse("master_api:work-center-detail", args=[work_center_id])

    def test_mst_wc_01_create_success(self):
        payload = {"code": "WC-NEW", "name": "新ワークセンター"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(WorkCenter.objects.filter(code="WC-NEW").exists())

    def test_mst_wc_02_duplicate_code_rejected(self):
        payload = {"code": self.work_center.code, "name": "別名"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_wc_03_update_code_is_read_only(self):
        response = self.client.patch(self._detail_url(self.work_center.id), {"code": "CHANGED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.work_center.refresh_from_db()
        self.assertNotEqual(self.work_center.code, "CHANGED")

    def test_mst_wc_04_delete_success(self):
        response = self.client.delete(self._detail_url(self.work_center.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(WorkCenter.objects.filter(id=self.work_center.id).exists())
