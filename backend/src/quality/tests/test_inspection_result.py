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


class InspectionResultListTests(QualityAPITestBase):
    """QUA-RESULT-LIST-* : 検査実績の一覧はページ単位で返し、絞り込みと合否の件数はサーバー側で行う。"""

    def setUp(self):
        super().setUp()
        self.item = self.create_inspection_item()
        for i in range(30):
            self.create_inspection_result(
                inspection_item=self.item, lot_number=f"LOT-{i:02d}", judgment="pass" if i % 3 else "fail"
            )
        self.url = reverse("quality_api:inspection-result-list")

    def test_qua_result_list_01_paginated_with_summary(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]), 25)
        self.assertEqual((response.data["count"], response.data["total_pages"]), (30, 2))
        self.assertEqual(response.data["summary"], {"total": 30, "passed": 20, "failed": 10})
        self.assertEqual(len(self.client.get(self.url, {"page": 2}).data["data"]), 5)

    def test_qua_result_list_02_filters_applied_on_server(self):
        response = self.client.get(self.url, {"judgment": "fail", "lot_number": "LOT-0"})
        self.assertEqual(response.data["summary"], {"total": 4, "passed": 0, "failed": 4})
        self.assertTrue(all(r["lot_number"].startswith("LOT-0") for r in response.data["data"]))


class NonFiniteValueTests(QualityAPITestBase):
    """QUA-NONFINITE-* : 測定値・規格値の NaN・Infinity を受け付けない(合格扱い・一覧の500を防ぐ)。"""

    def setUp(self):
        super().setUp()
        self.item = self.create_inspection_item()
        self.detail = self.create_measurement_detail(
            inspection_item=self.item, measurement_type="quantitative",
            specification_lower_limit=10.0, specification_upper_limit=20.0,
        )

    def test_qua_nonfinite_01_nan_or_infinity_measured_value_rejected(self):
        url = reverse("quality_api:inspection-result-list")
        for value in ("NaN", "Infinity", "-Infinity"):
            payload = {
                "inspection_item": str(self.item.id),
                "details": [{"measurement_detail": str(self.detail.id), "measured_value_numeric": value}],
            }
            response = self.client.post(url, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, value)
        self.assertFalse(InspectionResult.objects.exists())
        # 一覧も取得できる
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_qua_nonfinite_02_record_result_rejects_nan(self):
        import json

        url = reverse("quality_api:inspection-item-record-result", args=[self.item.id])
        payload = {"measurement_details_payload": json.dumps([{"measurement_detail_id": str(self.detail.id), "value": "NaN"}])}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(InspectionResult.objects.exists())

    def test_qua_nonfinite_03_specification_limits_validated(self):
        url = reverse("quality_api:inspection-item-detail", args=[self.item.id])
        base = {"id": str(self.detail.id), "name": "len", "measurement_type": "quantitative"}
        for spec in (
            {"specification_lower_limit": "NaN"},
            {"specification_upper_limit": "Infinity"},
            {"specification_lower_limit": 30, "specification_upper_limit": 20},
        ):
            response = self.client.patch(url, {"measurement_details": [{**base, **spec}]}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, spec)
