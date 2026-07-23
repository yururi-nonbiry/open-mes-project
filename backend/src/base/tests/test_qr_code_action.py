from django.urls import reverse
from rest_framework import status

from ..models import QrCodeAction
from .test_helpers import BaseAPITestBase


class QrCodeActionCrudTests(BaseAPITestBase):
    """BASE-QRACTION-* : QrCodeActionViewSet CRUD。標準DRF形式（CustomSuccessMessageMixin不使用）。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("base_api:qr-code-action-list")
        self.qr_action = self.create_qr_code_action()

    def _detail_url(self, action_id):
        return reverse("base_api:qr-code-action-detail", args=[action_id])

    def test_base_qraction_01_list_returns_plain_array(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_base_qraction_02_create_success(self):
        payload = {
            "name": "新規アクション",
            "action_type": "regex",
            "qr_code_pattern": r"^LOT-.+",
            "action_name": "update_inventory",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(QrCodeAction.objects.filter(name="新規アクション").exists())

    def test_base_qraction_03_duplicate_name_rejected(self):
        payload = {"name": self.qr_action.name, "action_type": "regex", "qr_code_pattern": r"^X-.+"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_qraction_04_filter_by_is_active(self):
        self.create_qr_code_action(name="無効アクション", is_active=False)
        response = self.client.get(self.list_url, {"is_active": "false"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [row["name"] for row in response.data]
        self.assertIn("無効アクション", names)
        self.assertNotIn(self.qr_action.name, names)

    def test_base_qraction_05_delete_returns_204(self):
        response = self.client.delete(self._detail_url(self.qr_action.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(QrCodeAction.objects.filter(id=self.qr_action.id).exists())

    def test_base_qraction_06_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_qraction_07_non_admin_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class QrCodeActionExecuteTests(BaseAPITestBase):
    """BASE-QREXEC-* : execute action。IsAuthenticatedへの降格対象。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:qr-code-action-execute-action")
        self.qr_action = self.create_qr_code_action(qr_code_pattern=r"^ITEM-.+", action_name="mark_as_received")

    def test_base_qrexec_01_non_admin_authenticated_matching_pattern(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {"qr_data": "ITEM-001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")
        self.assertEqual(response.data["action_name"], self.qr_action.name)

    def test_base_qrexec_02_no_matching_action_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {"qr_data": "UNKNOWN-999"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_base_qrexec_03_missing_qr_data_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_qrexec_04_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.url, {"qr_data": "ITEM-001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
