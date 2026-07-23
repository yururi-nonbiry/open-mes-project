from django.urls import reverse
from rest_framework import status

from ..models import InspectionItem, MeasurementDetail
from .test_helpers import QualityAPITestBase


class InspectionItemCrudTests(QualityAPITestBase):
    """QUA-ITEM-* : InspectionItemViewSet CRUD、ネストしたMeasurementDetailの同期挙動。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("quality_api:inspection-item-list")
        self.item = self.create_inspection_item()
        self.detail = self.create_measurement_detail(inspection_item=self.item)

    def _detail_url(self, item_id):
        return reverse("quality_api:inspection-item-detail", args=[item_id])

    def test_qua_item_01_list_success(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")
        codes = [row["code"] for row in response.data["data"]]
        self.assertIn(self.item.code, codes)

    def test_qua_item_02_create_with_nested_measurement_details(self):
        payload = {
            "code": "INS-NEW",
            "name": "新規検査項目",
            "inspection_type": "final",
            "target_object_type": "finished_good",
            "measurement_details": [
                {"name": "寸法A", "measurement_type": "quantitative", "specification_lower_limit": 1.0,
                 "specification_upper_limit": 2.0},
            ],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = InspectionItem.objects.get(code="INS-NEW")
        self.assertEqual(created.measurement_details.count(), 1)

    def test_qua_item_03_duplicate_code_rejected(self):
        payload = {
            "code": self.item.code,
            "name": "別名",
            "inspection_type": "final",
            "target_object_type": "finished_good",
            "measurement_details": [],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_qua_item_04_retrieve_shows_nested_measurement_details(self):
        response = self.client.get(self._detail_url(self.item.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        detail_names = [d["name"] for d in response.data["data"]["measurement_details"]]
        self.assertIn(self.detail.name, detail_names)

    def test_qua_item_05_update_name(self):
        payload = {"name": "更新後の名前", "measurement_details": [{"id": str(self.detail.id), "name": self.detail.name,
                    "measurement_type": self.detail.measurement_type}]}
        response = self.client.patch(self._detail_url(self.item.id), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertEqual(self.item.name, "更新後の名前")

    def test_qua_item_06_update_existing_measurement_detail(self):
        payload = {
            "measurement_details": [
                {"id": str(self.detail.id), "name": "更新済み外観確認", "measurement_type": "qualitative"},
            ],
        }
        response = self.client.patch(self._detail_url(self.item.id), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.detail.refresh_from_db()
        self.assertEqual(self.detail.name, "更新済み外観確認")

    def test_qua_item_07_update_adds_new_measurement_detail(self):
        payload = {
            "measurement_details": [
                {"id": str(self.detail.id), "name": self.detail.name, "measurement_type": self.detail.measurement_type},
                {"name": "新規測定項目", "measurement_type": "quantitative"},
            ],
        }
        response = self.client.patch(self._detail_url(self.item.id), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.item.measurement_details.count(), 2)

    def test_qua_item_08_update_omitting_existing_detail_deletes_it(self):
        second_detail = self.create_measurement_detail(inspection_item=self.item, name="寸法B")
        payload = {
            "measurement_details": [
                {"id": str(self.detail.id), "name": self.detail.name, "measurement_type": self.detail.measurement_type},
            ],
        }
        response = self.client.patch(self._detail_url(self.item.id), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(MeasurementDetail.objects.filter(id=second_detail.id).exists())

    def test_qua_item_09_update_omitting_protected_detail_returns_400(self):
        result = self.create_inspection_result(inspection_item=self.item)
        self.create_inspection_result_detail(inspection_result=result, measurement_detail=self.detail)
        payload = {"measurement_details": []}
        response = self.client.patch(self._detail_url(self.item.id), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], "error")
        self.assertTrue(MeasurementDetail.objects.filter(id=self.detail.id).exists())

    def test_qua_item_10_delete_cascades_to_measurement_details(self):
        response = self.client.delete(self._detail_url(self.item.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(InspectionItem.objects.filter(id=self.item.id).exists())
        self.assertFalse(MeasurementDetail.objects.filter(id=self.detail.id).exists())

    def test_qua_item_11_delete_blocked_by_inspection_result(self):
        self.create_inspection_result(inspection_item=self.item)
        response = self.client.delete(self._detail_url(self.item.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], "error")
        self.assertTrue(InspectionItem.objects.filter(id=self.item.id).exists())

    def test_qua_item_12_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
