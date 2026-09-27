from unittest import mock

from django.urls import reverse
from rest_framework import status

from .test_helpers import BaseAPITestBase


class ErrorResponseFormatTests(BaseAPITestBase):
    """BASE-ERR-* : 共通の例外ハンドラ(base.responses.api_exception_handler)によるエラー応答形式の統一。"""

    def assertErrorBody(self, response, expected_status):
        self.assertEqual(response.status_code, expected_status)
        self.assertIsInstance(response.data["error"], str)
        self.assertTrue(response.data["error"])
        self.assertNotIn("success", response.data)
        self.assertNotIn("status", response.data)
        self.assertNotIn("detail", response.data)

    def test_base_err_01_validation_error_has_message_and_field_errors(self):
        response = self.client.post(reverse("master_api:item-list"), {}, format="json")
        self.assertErrorBody(response, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data["errors"])
        # フォームを持たない画面でも原因が分かるよう、最初の項目エラーがメッセージに含まれる
        first_field = next(iter(response.data["errors"]))
        self.assertIn(first_field, response.data["error"])

    def test_base_err_02_not_found(self):
        url = reverse("master_api:item-detail", args=["00000000-0000-0000-0000-000000000000"])
        response = self.client.get(url)
        self.assertErrorBody(response, status.HTTP_404_NOT_FOUND)

    def test_base_err_03_not_authenticated_has_code(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("master_api:item-list"))
        self.assertErrorBody(response, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "not_authenticated")

    def test_base_err_04_permission_denied(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("base_api:model-fields"), {"data_type": "item"})
        self.assertErrorBody(response, status.HTTP_403_FORBIDDEN)

    def test_base_err_05_view_level_error(self):
        response = self.client.post(reverse("inventory_api:salesorder-issue"), {}, format="json")
        self.assertErrorBody(response, status.HTTP_400_BAD_REQUEST)

    def test_base_err_06_unexpected_exception_returns_500_without_internals(self):
        with (
            mock.patch("inventory.services.issue_sales_order", side_effect=RuntimeError("secret internal detail")),
            self.assertLogs("base.responses", level="ERROR"),
        ):
            response = self.client.post(
                reverse("inventory_api:salesorder-issue"),
                {"order_id": "00000000-0000-0000-0000-000000000000", "quantity_to_ship": 1},
                format="json",
            )
        self.assertErrorBody(response, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertNotIn("secret internal detail", response.data["error"])

    def test_base_err_07_jwt_login_failure(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            reverse("users_api:token_obtain_pair"), {"custom_id": "testuser", "password": "wrong"}, format="json"
        )
        self.assertErrorBody(response, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["error"], "指定されたIDまたはパスワードが正しくありません。")

    def test_base_err_08_bulk_save_validation_errors_keyed_by_field(self):
        response = self.client.post(
            reverse("base_api:model-display-setting-bulk-save") + "?data_type=item",
            [{"model_field_name": "code", "display_order": "not-a-number"}],
            format="json",
        )
        self.assertErrorBody(response, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data["errors"])
