from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .test_helpers import DEFAULT_PASSWORD, UsersAPITestBase


class JwtTokenTests(UsersAPITestBase):
    """USR-JWT-* : JWTトークンの発行・更新・失効 (simplejwt)。"""

    def setUp(self):
        super().setUp()
        self.token_url = reverse("users_api:token_obtain_pair")
        self.refresh_url = reverse("users_api:token_refresh")
        self.blacklist_url = reverse("users_api:token_blacklist")

    def test_usr_jwt_01_obtain_success(self):
        response = self.client.post(
            self.token_url, {"custom_id": "testuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_usr_jwt_02_obtain_wrong_password_rejected(self):
        response = self.client.post(self.token_url, {"custom_id": "testuser", "password": "wrongpw"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_usr_jwt_03_refresh_success(self):
        obtain_response = self.client.post(
            self.token_url, {"custom_id": "testuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        refresh = obtain_response.data["refresh"]
        response = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_usr_jwt_04_blacklisted_refresh_token_rejected(self):
        obtain_response = self.client.post(
            self.token_url, {"custom_id": "testuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        refresh = obtain_response.data["refresh"]
        blacklist_response = self.client.post(self.blacklist_url, {"refresh": refresh}, format="json")
        self.assertEqual(blacklist_response.status_code, status.HTTP_200_OK)

        response = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SessionInfoTests(APITestCase):
    """USR-SESSION-* : GET session/ (認証状態確認エンドポイント)。"""

    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.user = User.objects.create_user(custom_id="sessionuser", password=DEFAULT_PASSWORD, username="sessionuser")
        self.url = reverse("users_api:api_session_info")

    def test_usr_session_01_anonymous(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["isAuthenticated"])

    def test_usr_session_02_authenticated_via_jwt(self):
        token_url = reverse("users_api:token_obtain_pair")
        obtain_response = self.client.post(
            token_url, {"custom_id": "sessionuser", "password": DEFAULT_PASSWORD}, format="json"
        )
        access = obtain_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data["isAuthenticated"])
        self.assertFalse(data["isStaff"])
        self.assertFalse(data["isSuperuser"])
