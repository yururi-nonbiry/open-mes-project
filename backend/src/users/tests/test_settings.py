from django.urls import reverse
from rest_framework import status

from .test_helpers import DEFAULT_PASSWORD, UsersAPITestBase


class UserSettingsDetailTests(UsersAPITestBase):
    """USR-PROFILE-* : GET/PATCH settings/ (自分自身のプロフィール参照・更新)。"""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("users_api:api_user_settings")

    def test_usr_profile_01_get_returns_own_profile(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["custom_id"], "testuser")
        self.assertNotIn("password", response.data)

    def test_usr_profile_02_patch_updates_username_and_email(self):
        response = self.client.patch(self.url, {"username": "newname", "email": "new@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "newname")
        self.assertEqual(self.user.email, "new@example.com")

    def test_usr_profile_03_patch_ignores_is_staff(self):
        response = self.client.patch(self.url, {"is_staff": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_staff)


class PasswordChangeTests(UsersAPITestBase):
    """USR-PWCHANGE-* : POST settings/password/。"""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("users_api:api_user_password_change")

    def _payload(self, old="", new1="newpassword1", new2="newpassword1"):
        return {"old_password": old or DEFAULT_PASSWORD, "new_password1": new1, "new_password2": new2}

    def test_usr_pwchange_01_success(self):
        response = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpassword1"))
        self.assertFalse(self.user.check_password(DEFAULT_PASSWORD))

    def test_usr_pwchange_02_wrong_old_password_rejected(self):
        response = self.client.post(self.url, self._payload(old="wrongoldpw"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("old_password", response.data)

    def test_usr_pwchange_03_mismatched_new_passwords_rejected(self):
        response = self.client.post(self.url, self._payload(new2="different1"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
