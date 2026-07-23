import json

from django.urls import reverse
from rest_framework import status

from ..models import InspectionResult
from .test_helpers import QualityAPITestBase


class InspectionItemCustomActionTests(QualityAPITestBase):
    """QUA-ACTION-* : InspectionItemViewSetのカスタムaction（form-data / record-result）。"""

    def setUp(self):
        super().setUp()
        self.item = self.create_inspection_item()
        self.qty_detail = self.create_measurement_detail(
            inspection_item=self.item,
            name="寸法A",
            measurement_type="quantitative",
            specification_lower_limit=1.0,
            specification_upper_limit=10.0,
        )

    def _form_data_url(self):
        return reverse("quality_api:inspection-item-form-data", args=[self.item.id])

    def _record_result_url(self):
        return reverse("quality_api:inspection-item-record-result", args=[self.item.id])

    def test_qua_action_01_form_data_success(self):
        response = self.client.get(self._form_data_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        detail_names = [d["name"] for d in response.data["measurement_details"]]
        self.assertIn(self.qty_detail.name, detail_names)

    def test_qua_action_02_record_result_success(self):
        payload = {
            "part_number": "PART-200",
            "measurement_details_payload": json.dumps(
                [{"measurement_detail_id": str(self.qty_detail.id), "value": 5.0}]
            ),
        }
        response = self.client.post(self._record_result_url(), payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        result = InspectionResult.objects.get(part_number="PART-200")
        self.assertEqual(result.judgment, "pass")
        self.assertEqual(result.inspected_by, self.user)

    def test_qua_action_03_record_result_invalid_measurement_detail_id(self):
        payload = {
            "measurement_details_payload": json.dumps(
                [{"measurement_detail_id": "00000000-0000-0000-0000-000000000000", "value": 5.0}]
            ),
        }
        response = self.client.post(self._record_result_url(), payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])

    def test_qua_action_04_record_result_malformed_json_payload(self):
        payload = {"measurement_details_payload": "not-json"}
        response = self.client.post(self._record_result_url(), payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
