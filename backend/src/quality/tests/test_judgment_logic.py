from django.test import TestCase

from ..models import MeasurementDetail
from ..serializers import _judge_detail, compute_overall_judgment


class JudgeDetailTests(TestCase):
    """QUA-JUDGE-* : _judge_detail()の単体テスト（DB非依存の純粋関数）。"""

    def test_qua_judge_01_quantitative_within_range_is_pass(self):
        detail = MeasurementDetail(
            measurement_type="quantitative", specification_lower_limit=1.0, specification_upper_limit=10.0
        )
        self.assertTrue(_judge_detail(detail, 5.0, None))

    def test_qua_judge_02_quantitative_below_lower_is_fail(self):
        detail = MeasurementDetail(
            measurement_type="quantitative", specification_lower_limit=1.0, specification_upper_limit=10.0
        )
        self.assertFalse(_judge_detail(detail, 0.5, None))

    def test_qua_judge_03_quantitative_above_upper_is_fail(self):
        detail = MeasurementDetail(
            measurement_type="quantitative", specification_lower_limit=1.0, specification_upper_limit=10.0
        )
        self.assertFalse(_judge_detail(detail, 10.5, None))

    def test_qua_judge_04_quantitative_missing_value_is_pending(self):
        detail = MeasurementDetail(
            measurement_type="quantitative", specification_lower_limit=1.0, specification_upper_limit=10.0
        )
        self.assertIsNone(_judge_detail(detail, None, None))

    def test_qua_judge_05_qualitative_match_case_insensitive_stripped(self):
        detail = MeasurementDetail(measurement_type="qualitative", expected_qualitative_result="OK")
        self.assertTrue(_judge_detail(detail, None, "  ok  "))

    def test_qua_judge_06_qualitative_mismatch_is_fail(self):
        detail = MeasurementDetail(measurement_type="qualitative", expected_qualitative_result="OK")
        self.assertFalse(_judge_detail(detail, None, "NG"))

    def test_qua_judge_07_qualitative_missing_result_is_pending(self):
        detail = MeasurementDetail(measurement_type="qualitative", expected_qualitative_result="OK")
        self.assertIsNone(_judge_detail(detail, None, None))

    def test_qua_judge_08_qualitative_no_expected_result_always_pass(self):
        detail = MeasurementDetail(measurement_type="qualitative", expected_qualitative_result=None)
        self.assertTrue(_judge_detail(detail, None, "anything"))


class ComputeOverallJudgmentTests(TestCase):
    """QUA-JUDGE-OVERALL-* : compute_overall_judgment()の単体テスト。"""

    def setUp(self):
        self.qty_detail = MeasurementDetail(
            measurement_type="quantitative", specification_lower_limit=1.0, specification_upper_limit=10.0
        )

    def test_qua_judge_overall_01_empty_details_is_pending(self):
        self.assertEqual(compute_overall_judgment([]), "pending")

    def test_qua_judge_overall_02_any_fail_makes_overall_fail(self):
        details_data = [
            {"measurement_detail": self.qty_detail, "measured_value_numeric": 5.0},
            {"measurement_detail": self.qty_detail, "measured_value_numeric": 999.0},
        ]
        self.assertEqual(compute_overall_judgment(details_data), "fail")

    def test_qua_judge_overall_03_pending_without_fail_is_pending(self):
        details_data = [
            {"measurement_detail": self.qty_detail, "measured_value_numeric": 5.0},
            {"measurement_detail": self.qty_detail, "measured_value_numeric": None},
        ]
        self.assertEqual(compute_overall_judgment(details_data), "pending")

    def test_qua_judge_overall_04_all_pass_is_pass(self):
        details_data = [
            {"measurement_detail": self.qty_detail, "measured_value_numeric": 5.0},
            {"measurement_detail": self.qty_detail, "measured_value_numeric": 6.0},
        ]
        self.assertEqual(compute_overall_judgment(details_data), "pass")
