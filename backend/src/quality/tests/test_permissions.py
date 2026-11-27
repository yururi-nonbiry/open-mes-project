from django.urls import reverse
from rest_framework import status

from ..models import InspectionResult
from .test_helpers import QualityAPITestBase


class QualityPermissionTests(QualityAPITestBase):
    """QUA-PERM-* : 検査項目マスターの変更・削除と検査実績の削除は管理者のみ。"""

    def setUp(self):
        super().setUp()
        self.item = self.create_inspection_item()
        self.result = self.create_inspection_result(inspection_item=self.item)
        self.client.force_authenticate(user=self.general_user)

    def test_qua_perm_01_general_user_cannot_change_inspection_item(self):
        url = reverse("quality_api:inspection-item-detail", args=[self.item.pk])
        self.assertEqual(self.client.patch(url, {"name": "x"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)

    def test_qua_perm_02_general_user_cannot_delete_inspection_result(self):
        url = reverse("quality_api:inspection-result-detail", args=[self.result.pk])
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(InspectionResult.objects.filter(pk=self.result.pk).exists())
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
