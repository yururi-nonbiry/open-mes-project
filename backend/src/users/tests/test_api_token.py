from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token

from .test_helpers import UsersAPITestBase


class ApiTokenTests(UsersAPITestBase):
    """USR-TOKEN-* : GET/POST settings/token/ (QRリーダー等の外部連携向け固定トークン)。"""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("users_api:api_user_token")

    def test_usr_token_01_get_creates_token_if_missing(self):
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(Token.objects.filter(user=self.user).exists())
        self.assertEqual(response.data["api_token"], Token.objects.get(user=self.user).key)

    def test_usr_token_02_get_returns_same_token_on_repeat_calls(self):
        first = self.client.get(self.url).data["api_token"]
        second = self.client.get(self.url).data["api_token"]
        self.assertEqual(first, second)

    def test_usr_token_03_post_regenerates_token(self):
        old_key = self.client.get(self.url).data["api_token"]
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_key = response.data["api_token"]
        self.assertNotEqual(old_key, new_key)
        self.assertEqual(Token.objects.filter(user=self.user).count(), 1)

    def test_usr_token_04_token_authenticates_requests(self):
        token_key = self.client.post(self.url).data["api_token"]

        from rest_framework.test import APIClient

        device_client = APIClient()
        device_client.credentials(HTTP_AUTHORIZATION=f"Token {token_key}")
        response = device_client.get(reverse("users_api:api_user_settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["custom_id"], "testuser")


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
