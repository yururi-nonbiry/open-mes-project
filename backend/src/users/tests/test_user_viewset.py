from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from .test_helpers import UsersAPITestBase

User = get_user_model()


class UserViewSetPermissionTests(UsersAPITestBase):
    """USR-VS-PERM-* : UserViewSet の staff/superuser 限定アクセス。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("users_api:user-list")

    def test_usr_vs_perm_01_anonymous_rejected(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_usr_vs_perm_02_regular_user_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_usr_vs_perm_03_staff_user_allowed(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_usr_vs_perm_04_superuser_allowed(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class UserViewSetCrudTests(UsersAPITestBase):
    """USR-VS-CRUD-* : UserViewSet のCRUD (staff権限で操作)。"""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.staff_user)
        self.list_url = reverse("users_api:user-list")

    def _detail_url(self, user_id):
        return reverse("users_api:user-detail", args=[user_id])

    def test_usr_vs_crud_01_list(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # UserViewSet はページネーションを設定していないため、プレーンな配列が返る。
        self.assertEqual(len(response.data), 3)

    def test_usr_vs_crud_02_create_requires_password(self):
        response = self.client.post(self.list_url, {"custom_id": "newuser"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_usr_vs_crud_03_create_success(self):
        payload = {"custom_id": "newuser", "username": "newuser", "password": "pw12345"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(custom_id="newuser")
        self.assertTrue(created.check_password("pw12345"))

    def test_usr_vs_crud_04_retrieve(self):
        response = self.client.get(self._detail_url(self.user.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["custom_id"], "testuser")

    def test_usr_vs_crud_05_partial_update_is_staff(self):
        response = self.client.patch(self._detail_url(self.user.id), {"is_staff": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)

    def test_usr_vs_crud_06_partial_update_password_is_hashed(self):
        response = self.client.patch(self._detail_url(self.user.id), {"password": "brandnewpw1"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brandnewpw1"))
        self.assertNotEqual(self.user.password, "brandnewpw1")

    def test_usr_vs_crud_07_delete(self):
        response = self.client.delete(self._detail_url(self.user.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.user.id).exists())

    def test_usr_vs_crud_08_duplicate_custom_id_rejected(self):
        payload = {"custom_id": "testuser", "username": "dup", "password": "pw12345"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
