from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, override_settings
from django.urls import reverse
from rest_framework import status

from base.models import QrCodeAction

from ..audit import get_client_ip, log_event
from ..models import AccessLog
from .test_helpers import CLIENT_IP, DEFAULT_PASSWORD, SecurityAPITestBase

Event = AccessLog.EventType


class ClientIpTests(SecurityAPITestBase):
    """SEC-IPADDR-* : アクセス元IPの判定。"""

    def _request(self, **meta):
        return RequestFactory().get("/", **meta)

    @override_settings(TRUST_X_REAL_IP=True)
    def test_sec_ipaddr_01_uses_x_real_ip_when_trusted(self):
        request = self._request(REMOTE_ADDR="172.18.0.5", HTTP_X_REAL_IP="203.0.113.7", HTTP_X_FORWARDED_FOR="1.1.1.1")
        self.assertEqual(get_client_ip(request), "203.0.113.7")

    @override_settings(TRUST_X_REAL_IP=False)
    def test_sec_ipaddr_02_ignores_headers_when_not_trusted(self):
        request = self._request(REMOTE_ADDR="172.18.0.5", HTTP_X_REAL_IP="203.0.113.7", HTTP_X_FORWARDED_FOR="1.1.1.1")
        self.assertEqual(get_client_ip(request), "172.18.0.5")

    @override_settings(TRUST_X_REAL_IP=True)
    def test_sec_ipaddr_03_invalid_header_falls_back_to_remote_addr(self):
        request = self._request(REMOTE_ADDR="172.18.0.5", HTTP_X_REAL_IP="not-an-ip")
        self.assertEqual(get_client_ip(request), "172.18.0.5")


class AuditLogTests(SecurityAPITestBase):
    """SEC-AUDIT-* : 監査ログの記録。"""

    def test_sec_audit_01_login_success_is_logged(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log = AccessLog.objects.get(event_type=Event.LOGIN_SUCCESS)
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.ip_address, CLIENT_IP)
        self.assertEqual(log.path, self.token_url)

    def test_sec_audit_02_logging_failure_does_not_break_login(self):
        with mock.patch.object(AccessLog.objects, "create", side_effect=RuntimeError("db down")):
            self.assertIsNone(log_event(Event.LOGIN_SUCCESS))
            response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_sec_audit_03_permission_denied_is_logged(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("users_api:user-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        log = AccessLog.objects.get(event_type=Event.PERMISSION_DENIED)
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.status_code, 403)

    def test_sec_audit_04_token_refresh_failure_is_logged(self):
        response = self.client.post(reverse("users_api:token_refresh"), {"refresh": "broken"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(AccessLog.objects.filter(event_type=Event.TOKEN_REFRESH_FAILED).exists())

    def test_sec_audit_05_user_update_records_changes_without_password(self):
        self.client.force_authenticate(self.staff_user)
        response = self.client.patch(
            reverse("users_api:user-detail", args=[self.user.id]),
            {"username": "renamed", "password": "new-secret-pass"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log = AccessLog.objects.get(event_type=Event.USER_UPDATED)
        self.assertEqual(log.user, self.staff_user)
        self.assertEqual(log.detail["target"], "testuser")
        self.assertEqual(log.detail["changes"], {"username": {"before": "testuser", "after": "renamed"}})
        self.assertTrue(log.detail["password_changed"])
        self.assertNotIn("new-secret-pass", str(log.detail))

    def test_sec_audit_06_user_create_and_delete_are_logged(self):
        self.client.force_authenticate(self.staff_user)
        response = self.client.post(
            reverse("users_api:user-list"), {"custom_id": "newbie", "password": "secret-pass"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = AccessLog.objects.get(event_type=Event.USER_CREATED)
        self.assertEqual(created.detail["values"]["custom_id"], "newbie")
        self.assertNotIn("password", created.detail["values"])

        response = self.client.delete(reverse("users_api:user-detail", args=[response.data["id"]]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(AccessLog.objects.get(event_type=Event.USER_DELETED).detail["target"], "newbie")

    def test_sec_audit_07_profile_and_password_changes_are_logged(self):
        self.client.force_authenticate(self.user)
        self.client.patch(reverse("users_api:api_user_settings"), {"username": "me"}, format="json")
        self.client.post(
            reverse("users_api:api_user_password_change"),
            {"old_password": DEFAULT_PASSWORD, "new_password1": "another-pass", "new_password2": "another-pass"},
            format="json",
        )
        profile = AccessLog.objects.get(event_type=Event.PROFILE_UPDATED)
        self.assertEqual(profile.detail["changes"]["username"], {"before": "testuser", "after": "me"})
        self.assertTrue(AccessLog.objects.filter(event_type=Event.PASSWORD_CHANGED, user=self.user).exists())

    def test_sec_audit_08_settings_change_and_csv_import_are_logged(self):
        self.client.force_authenticate(self.staff_user)
        response = self.client.post(
            reverse("base_api:qr-code-action-list"),
            {"name": "入庫", "action_type": "regex", "qr_code_pattern": "^PO-", "action_name": "mark_as_received"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        log = AccessLog.objects.get(event_type=Event.SETTINGS_CHANGED)
        self.assertEqual(log.detail["setting"], "qr_code_action")
        self.assertEqual(log.detail["operation"], "create")

        self.client.delete(reverse("base_api:qr-code-action-detail", args=[QrCodeAction.objects.get().pk]))
        self.assertTrue(
            AccessLog.objects.filter(event_type=Event.SETTINGS_CHANGED, detail__operation="delete").exists()
        )

        with mock.patch("base.api.import_csv_task.apply_async"), mock.patch("base.api.FileSystemStorage"):
            response = self.client.post(
                reverse("base_api:csv-mapping-import-csv") + "?data_type=item",
                {"csv_file": SimpleUploadedFile("items.csv", b"code\nA\n", content_type="text/csv")},
                format="multipart",
            )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        log = AccessLog.objects.get(event_type=Event.CSV_IMPORTED)
        self.assertEqual(log.detail["file_name"], "items.csv")
        self.assertEqual(log.detail["data_type"], "item")
