from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

User = get_user_model()

DEFAULT_PASSWORD = "testpassword123"
CLIENT_IP = "198.51.100.10"
OTHER_IP = "198.51.100.20"

# パスワードのハッシュ計算を軽くし、ログイン試行を繰り返すテストを速くする
FAST_HASHER = override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])


@FAST_HASHER
class SecurityAPITestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(custom_id="testuser", password=DEFAULT_PASSWORD, username="testuser")
        self.staff_user = User.objects.create_user(
            custom_id="staffuser", password=DEFAULT_PASSWORD, username="staffuser", is_staff=True
        )
        self.token_url = reverse("users_api:token_obtain_pair")

    def login(self, custom_id="testuser", password=DEFAULT_PASSWORD, ip=CLIENT_IP, **extra):
        return self.client.post(
            self.token_url, {"custom_id": custom_id, "password": password, **extra}, format="json", REMOTE_ADDR=ip
        )

    def fail_logins(self, times, custom_id="testuser", ip=CLIENT_IP):
        for _ in range(times):
            self.login(custom_id=custom_id, password="wrong-password", ip=ip)
