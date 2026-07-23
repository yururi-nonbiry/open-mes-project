from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import AsyncTask, CsvColumnMapping, ModelDisplaySetting, QrCodeAction

User = get_user_model()


class BaseAPITestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.admin_user = User.objects.create_user(
            custom_id="adminuser", password="testpassword", username="adminuser", is_staff=True
        )
        self.client.force_authenticate(user=self.admin_user)

    def create_csv_column_mapping(self, **kwargs):
        defaults = {
            "data_type": "item",
            "csv_header": "品目コード",
            "model_field_name": "code",
            "order": 1,
        }
        defaults.update(kwargs)
        return CsvColumnMapping.objects.create(**defaults)

    def create_model_display_setting(self, **kwargs):
        defaults = {
            "data_type": "item",
            "model_field_name": "code",
        }
        defaults.update(kwargs)
        return ModelDisplaySetting.objects.create(**defaults)

    def create_qr_code_action(self, **kwargs):
        defaults = {
            "name": "テストアクション",
            "action_type": "regex",
            "qr_code_pattern": r"^ITEM-.+",
            "action_name": "mark_as_received",
        }
        defaults.update(kwargs)
        return QrCodeAction.objects.create(**defaults)

    def create_async_task(self, **kwargs):
        defaults = {
            "task_id": "11111111-1111-1111-1111-111111111111",
            "task_name": "CSV Import: item",
            "status": "PENDING",
        }
        defaults.update(kwargs)
        return AsyncTask.objects.create(**defaults)
