from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token

from .test_helpers import DEFAULT_PASSWORD, UsersAPITestBase


class ApiTokenTests(UsersAPITestBase):
    """USR-TOKEN-* : GET/POST settings/token/ (QRリーダー等の外部連携向け固定トークン)。"""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("users_api:api_user_token")

    def _allow_general_user(self):
        from users.models import ApiTokenPolicy

        ApiTokenPolicy.objects.create(user=self.user)

    def test_usr_token_01_get_does_not_create_token(self):
        """参照では発行しない(既存のトークンだけを返す)。発行できるかも返す。"""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["api_token"])
        self.assertFalse(response.data["can_issue"])
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_usr_token_02_get_returns_existing_token(self):
        token = Token.objects.create(user=self.user)
        self.assertEqual(self.client.get(self.url).data["api_token"], token.key)

    def test_usr_token_03_post_regenerates_token(self):
        self._allow_general_user()
        old_key = Token.objects.create(user=self.user).key
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_key = response.data["api_token"]
        self.assertNotEqual(old_key, new_key)
        self.assertEqual(Token.objects.filter(user=self.user).count(), 1)

    def test_usr_token_04_token_authenticates_requests(self):
        self._allow_general_user()
        token_key = self.client.post(self.url).data["api_token"]

        from rest_framework.test import APIClient

        device_client = APIClient()
        device_client.credentials(HTTP_AUTHORIZATION=f"Token {token_key}")
        response = device_client.get(reverse("users_api:api_user_settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["custom_id"], "testuser")

    def test_usr_token_05_general_user_without_policy_cannot_issue(self):
        """ポリシー(接続元IP・スコープ)を管理者が設定していない一般ユーザーは、制限のない固定トークンを発行できない。"""
        self.assertEqual(self.client.post(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        response = self.client.post(
            reverse("api_token_auth"), {"username": "testuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_usr_token_06_staff_can_issue_without_policy(self):
        self.client.force_authenticate(user=self.staff_user)
        self.assertEqual(self.client.post(self.url).status_code, status.HTTP_200_OK)
        response = self.client.post(
            reverse("api_token_auth"), {"username": "staffuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class LogoutTests(UsersAPITestBase):
    """USR-LOGOUT-* : POST logout/ (JWTセッション + APIトークンの無効化)。"""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("users_api:api_logout")

    def test_usr_logout_01_deletes_existing_token(self):
        Token.objects.create(user=self.user)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_usr_logout_02_success_without_existing_token(self):
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
