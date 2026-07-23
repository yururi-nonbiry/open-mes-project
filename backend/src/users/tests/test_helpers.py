from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()

DEFAULT_PASSWORD = "testpassword123"


class UsersAPITestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            custom_id="testuser", password=DEFAULT_PASSWORD, username="testuser", email="testuser@example.com"
        )
        self.staff_user = User.objects.create_user(
            custom_id="staffuser", password=DEFAULT_PASSWORD, username="staffuser", is_staff=True
        )
        self.superuser = User.objects.create_superuser(
            custom_id="superuser", password=DEFAULT_PASSWORD, username="superuser"
        )
