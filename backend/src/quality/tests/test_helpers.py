from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import InspectionItem, InspectionResult, InspectionResultDetail, MeasurementDetail

User = get_user_model()


class QualityAPITestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.client.force_authenticate(user=self.user)

    def create_inspection_item(self, **kwargs):
        defaults = {
            "code": "INS-001",
            "name": "テスト検査項目",
            "inspection_type": "acceptance",
            "target_object_type": "raw_material",
        }
        defaults.update(kwargs)
        return InspectionItem.objects.create(**defaults)

    def create_measurement_detail(self, inspection_item=None, **kwargs):
        defaults = {
            "inspection_item": inspection_item or self.create_inspection_item(),
            "name": "外観確認",
            "measurement_type": "qualitative",
            "expected_qualitative_result": "OK",
        }
        defaults.update(kwargs)
        return MeasurementDetail.objects.create(**defaults)

    def create_inspection_result(self, inspection_item=None, **kwargs):
        defaults = {
            "inspection_item": inspection_item or self.create_inspection_item(),
            "part_number": "PART-001",
        }
        defaults.update(kwargs)
        return InspectionResult.objects.create(**defaults)

    def create_inspection_result_detail(self, inspection_result=None, measurement_detail=None, **kwargs):
        defaults = {
            "inspection_result": inspection_result or self.create_inspection_result(),
            "measurement_detail": measurement_detail or self.create_measurement_detail(),
        }
        defaults.update(kwargs)
        return InspectionResultDetail.objects.create(**defaults)
