from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import Machine

User = get_user_model()


class MachineAPITestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.client.force_authenticate(user=self.user)

    def create_machine(self, **kwargs):
        defaults = {
            "machine_number": "MCH-001",
            "name": "テスト設備",
        }
        defaults.update(kwargs)
        return Machine.objects.create(**defaults)
