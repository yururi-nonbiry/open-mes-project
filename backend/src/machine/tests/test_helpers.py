from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import Machine

User = get_user_model()


class MachineAPITestBase(APITestCase):
    def setUp(self):
        # 既存のマスターの変更・削除は管理者のみのため、CRUDの確認は管理者で行う(一般ユーザーの制限は別途確認する)
        self.user = User.objects.create_user(
            custom_id="testuser", password="testpassword", username="testuser", is_staff=True
        )
        self.general_user = User.objects.create_user(
            custom_id="generaluser", password="testpassword", username="generaluser"
        )
        self.client.force_authenticate(user=self.user)

    def create_machine(self, **kwargs):
        defaults = {
            "machine_number": "MCH-001",
            "name": "テスト設備",
        }
        defaults.update(kwargs)
        return Machine.objects.create(**defaults)
