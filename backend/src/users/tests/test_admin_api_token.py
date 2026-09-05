from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from ..models import ApiTokenPolicy
from .test_helpers import UsersAPITestBase


class AdminApiTokenActionTests(UsersAPITestBase):
    """USR-ADMTOKEN-* : 管理者による他ユーザーのAPIトークン発行・ポリシー編集 (/api/users/<pk>/token/)。"""

    def setUp(self):
        super().setUp()
        self.token_url = reverse("users_api:user-token", args=[self.user.id])

    def test_usr_admtoken_01_non_staff_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.token_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_usr_admtoken_02_get_creates_token_and_policy(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get(self.token_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(Token.objects.filter(user=self.user).exists())
        policy = ApiTokenPolicy.objects.get(user=self.user)
        self.assertTrue(policy.is_active)
        self.assertEqual(policy.scopes, [])
        self.assertEqual(response.data["api_token"], Token.objects.get(user=self.user).key)

    def test_usr_admtoken_03_post_regenerates_token(self):
        self.client.force_authenticate(user=self.staff_user)
        old_key = self.client.get(self.token_url).data["api_token"]
        response = self.client.post(self.token_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(old_key, response.data["api_token"])
        self.assertEqual(Token.objects.filter(user=self.user).count(), 1)

    def test_usr_admtoken_04_patch_updates_policy(self):
        self.client.force_authenticate(user=self.superuser)
        payload = {"is_active": False, "allowed_ips": "10.0.0.1", "scopes": ["master_api"]}
        response = self.client.patch(self.token_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        policy = ApiTokenPolicy.objects.get(user=self.user)
        self.assertFalse(policy.is_active)
        self.assertEqual(policy.allowed_ips, "10.0.0.1")
        self.assertEqual(policy.scopes, ["master_api"])

    def test_usr_admtoken_05_patch_rejects_invalid_ip(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.patch(self.token_url, {"allowed_ips": "not-an-ip"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_usr_admtoken_06_patch_rejects_invalid_scope(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.patch(self.token_url, {"scopes": ["bogus_api"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ScopedTokenAuthenticationTests(UsersAPITestBase):
    """USR-SCOPEDAUTH-* : ScopedTokenAuthentication によるトークンの有効フラグ/IP/スコープ制御。"""

    def setUp(self):
        super().setUp()
        self.token = Token.objects.create(user=self.user)
        self.device_client = APIClient()
        self.device_client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.settings_url = reverse("users_api:api_user_settings")

    def test_usr_scopedauth_01_no_policy_is_unrestricted(self):
        response = self.device_client.get(self.settings_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_usr_scopedauth_02_inactive_policy_blocks(self):
        ApiTokenPolicy.objects.create(user=self.user, is_active=False)
        response = self.device_client.get(self.settings_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_usr_scopedauth_03_ip_allowlist_blocks_and_allows(self):
        ApiTokenPolicy.objects.create(user=self.user, allowed_ips="10.0.0.5")

        blocked = self.device_client.get(self.settings_url)
        self.assertEqual(blocked.status_code, status.HTTP_401_UNAUTHORIZED)

        allowed = self.device_client.get(self.settings_url, HTTP_X_FORWARDED_FOR="10.0.0.5")
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_usr_scopedauth_04_scope_restricts_to_named_apps(self):
        ApiTokenPolicy.objects.create(user=self.user, scopes=["master_api"])

        out_of_scope = self.device_client.get(self.settings_url)
        self.assertEqual(out_of_scope.status_code, status.HTTP_401_UNAUTHORIZED)

        in_scope = self.device_client.get(reverse("master_api:item-list"))
        self.assertEqual(in_scope.status_code, status.HTTP_200_OK)
