from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .test_helpers import DEFAULT_PASSWORD

User = get_user_model()


class PasswordExpirationMiddlewareTests(APITestCase):
    """USR-PWEXP-* : PasswordExpirationMiddleware (セッション認証経路)。

    process_view はDjangoの通常のミドルウェアフックであり、DRFの認証(perform_authentication)
    より先に実行される。そのため request.user はこの時点ではDjangoのセッション認証結果のみを
    反映しており、JWT/Tokenでの認証結果はまだ反映されていない。ここではミドルウェア自体が
    セッション認証経路では機能することを確認する。
    """

    def setUp(self):
        self.user = User.objects.create_user(custom_id="expuser", password=DEFAULT_PASSWORD, username="expuser")
        self.settings_url = reverse("users_api:api_user_settings")
        self.logout_url = reverse("users_api:api_logout")

    def _expire_password(self):
        self.user.password_last_changed = timezone.now() - timedelta(days=200)
        self.user.save(update_fields=["password_last_changed"])

    @staticmethod
    def _blocked_by_password_expiration(response):
        return response.status_code == status.HTTP_403_FORBIDDEN and response.json().get("code") == "password_expired"

    def test_usr_pwexp_01_blocks_session_authenticated_expired_password(self):
        self._expire_password()
        self.client.login(custom_id="expuser", password=DEFAULT_PASSWORD)
        response = self.client.get(self.settings_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json()["code"], "password_expired")

    def test_usr_pwexp_02_no_block_when_password_not_expired(self):
        # DRFのDEFAULT_AUTHENTICATION_CLASSESにセッション認証は含まれないため、
        # セッションログインのみではDRFビュー自体のIsAuthenticatedは満たせず401になるが、
        # ここで確認したいのはミドルウェアがpassword_expiredで403ブロックしていないことのみ。
        self.client.login(custom_id="expuser", password=DEFAULT_PASSWORD)
        response = self.client.get(self.settings_url)
        self.assertFalse(self._blocked_by_password_expiration(response))

    def test_usr_pwexp_03_exempt_logout_endpoint_not_blocked(self):
        self._expire_password()
        self.client.login(custom_id="expuser", password=DEFAULT_PASSWORD)
        response = self.client.post(self.logout_url)
        self.assertFalse(self._blocked_by_password_expiration(response))

    def test_usr_pwexp_04_jwt_authenticated_expired_password_is_not_blocked(self):
        """既知の懸念事項: process_viewの実行タイミング上、JWT認証時は本チェックが effectively 無効。"""
        self._expire_password()
        token_url = reverse("users_api:token_obtain_pair")
        obtain_response = self.client.post(
            token_url, {"custom_id": "expuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        access = obtain_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.get(self.settings_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
