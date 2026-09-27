from django.urls import reverse
from rest_framework import status

from ..models import InspectionResult, InspectionResultDetail
from .test_helpers import QualityAPITestBase


class InspectionResultCrudTests(QualityAPITestBase):
    """QUA-RESULT-* : InspectionResultViewSet CRUD、判定ロジック、read_only_fields。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("quality_api:inspection-result-list")
        self.item = self.create_inspection_item()
        self.qty_detail = self.create_measurement_detail(
            inspection_item=self.item,
            name="寸法A",
            measurement_type="quantitative",
            specification_lower_limit=10.0,
            specification_upper_limit=20.0,
        )
        self.qual_detail = self.create_measurement_detail(
            inspection_item=self.item,
            name="外観",
            measurement_type="qualitative",
            expected_qualitative_result="OK",
        )

    def _detail_url(self, result_id):
        return reverse("quality_api:inspection-result-detail", args=[result_id])

    def test_qua_result_01_create_all_pass_judgment(self):
        payload = {
            "inspection_item": str(self.item.id),
            "part_number": "PART-100",
            "details": [
                {"measurement_detail": str(self.qty_detail.id), "measured_value_numeric": 15.0},
                {"measurement_detail": str(self.qual_detail.id), "result_qualitative": "OK"},
            ],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        result = InspectionResult.objects.get(part_number="PART-100")
        self.assertEqual(result.judgment, "pass")
        self.assertEqual(result.inspected_by, self.user)
        self.assertEqual(InspectionResultDetail.objects.filter(inspection_result=result).count(), 2)

    def test_qua_result_02_create_out_of_range_judgment_fail(self):
        payload = {
            "inspection_item": str(self.item.id),
            "details": [
                {"measurement_detail": str(self.qty_detail.id), "measured_value_numeric": 999.0},
            ],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        result = InspectionResult.objects.get(id=response.data["data"]["id"])
        self.assertEqual(result.judgment, "fail")

    def test_qua_result_02b_omitted_measurement_detail_is_pending(self):
        """検査項目の測定詳細を送信しなかった場合、送信分が全て合格でも合格にはならず保留になる。"""
        payload = {
            "inspection_item": str(self.item.id),
            "details": [
                {"measurement_detail": str(self.qty_detail.id), "measured_value_numeric": 15.0},
            ],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        result = InspectionResult.objects.get(id=response.data["data"]["id"])
        self.assertEqual(result.judgment, "pending")

    def test_qua_result_02c_detail_of_other_item_rejected(self):
        other_item = self.create_inspection_item(code="INS-OTHER", name="別の検査項目")
        other_detail = self.create_measurement_detail(
            inspection_item=other_item, name="別寸法", measurement_type="quantitative"
        )
        payload = {
            "inspection_item": str(self.item.id),
            "details": [
                {"measurement_detail": str(self.qty_detail.id), "measured_value_numeric": 15.0},
                {"measurement_detail": str(self.qual_detail.id), "result_qualitative": "OK"},
                {"measurement_detail": str(other_detail.id), "measured_value_numeric": 1.0},
            ],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_qua_result_02d_details_not_updatable(self):
        payload = {
            "inspection_item": str(self.item.id),
            "details": [
                {"measurement_detail": str(self.qty_detail.id), "measured_value_numeric": 999.0},
            ],
        }
        result_id = self.client.post(self.list_url, payload, format="json").data["data"]["id"]
        response = self.client.patch(
            self._detail_url(result_id),
            {"details": [{"measurement_detail": str(self.qty_detail.id), "measured_value_numeric": 15.0}]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(self._detail_url(result_id), {"remarks": "再確認済み"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_qua_result_03_create_missing_value_judgment_pending(self):
        payload = {
            "inspection_item": str(self.item.id),
            "details": [
                {"measurement_detail": str(self.qty_detail.id)},
            ],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        result = InspectionResult.objects.get(id=response.data["data"]["id"])
        self.assertEqual(result.judgment, "pending")

    def test_qua_result_04_create_ignores_client_supplied_inspected_by_and_judgment(self):
        payload = {
            "inspection_item": str(self.item.id),
            "judgment": "fail",
            "details": [],
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        result = InspectionResult.objects.get(id=response.data["data"]["id"])
        self.assertEqual(result.judgment, "pending")
        self.assertEqual(result.inspected_by, self.user)

    def test_qua_result_05_list_shows_inspected_by_username(self):
        self.create_inspection_result(inspection_item=self.item, inspected_by=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [row["inspected_by_username"] for row in response.data["data"]]
        self.assertIn(self.user.username, usernames)

    def test_qua_result_06_delete_cascades_to_details(self):
        result = self.create_inspection_result(inspection_item=self.item)
        result_detail = self.create_inspection_result_detail(
            inspection_result=result, measurement_detail=self.qty_detail
        )
        response = self.client.delete(self._detail_url(result.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(InspectionResultDetail.objects.filter(id=result_detail.id).exists())

    def test_qua_result_07_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
