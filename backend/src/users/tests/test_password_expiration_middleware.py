from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .test_helpers import DEFAULT_PASSWORD

User = get_user_model()


class PasswordExpirationMiddlewareTests(APITestCase):
    """USR-PWEXP-* : PasswordExpirationMiddleware (セッション認証・JWT認証)。

    process_view はDRFの認証より先に実行されるため、JWTで認証したユーザーはミドルウェア内で
    Authorizationヘッダーから解決している。
    """

    def setUp(self):
        self.user = User.objects.create_user(custom_id="expuser", password=DEFAULT_PASSWORD, username="expuser")
        # 有効期限切れでも開ける(パスワード変更画面用の)設定APIとは別の、除外されていないAPIで確認する
        self.settings_url = reverse("users_api:user-list")
        self.own_settings_url = reverse("users_api:api_user_settings")
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

    def _bearer(self):
        obtain_response = self.client.post(
            reverse("users_api:token_obtain_pair"), {"custom_id": "expuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {obtain_response.data['access']}")

    def test_usr_pwexp_04_jwt_authenticated_expired_password_is_blocked(self):
        """JWTで認証したユーザーもミドルウェアでブロックされる(JWTをミドルウェア内で解決する)。"""
        self._expire_password()
        self._bearer()
        response = self.client.get(self.settings_url)
        self.assertTrue(self._blocked_by_password_expiration(response))

    def test_usr_pwexp_05_jwt_expired_password_can_open_own_settings(self):
        """期限切れのユーザーも、パスワードを変更できるよう自分の設定は開ける。"""
        self._expire_password()
        self._bearer()
        response = self.client.get(self.own_settings_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_usr_pwexp_06_jwt_not_expired_is_not_blocked(self):
        self._bearer()
        response = self.client.get(self.settings_url)
        self.assertFalse(self._blocked_by_password_expiration(response))

    def test_usr_pwexp_07_fixed_token_expired_password_is_blocked(self):
        """固定トークンで認証したユーザーも、パスワードの有効期限切れを検出する。"""
        from rest_framework.authtoken.models import Token

        self._expire_password()
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get(self.settings_url)
        self.assertTrue(self._blocked_by_password_expiration(response))

    def test_usr_pwexp_08_system_account_not_blocked(self):
        """システム連携用アカウント(QRリーダー等)はパスワードの有効期限で止めない。"""
        from rest_framework.authtoken.models import Token

        self.user.account_type = User.AccountType.SYSTEM
        self.user.save(update_fields=["account_type"])
        self._expire_password()
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get(self.own_settings_url)
        self.assertFalse(self._blocked_by_password_expiration(response))
        response = self.client.get(self.settings_url)
        self.assertFalse(self._blocked_by_password_expiration(response))
