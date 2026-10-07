from datetime import timedelta

from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from ..audit import log_event
from ..models import AccessLog, AccountLock, IpBlock
from .test_helpers import CLIENT_IP, SecurityAPITestBase

Event = AccessLog.EventType


class AccessLogApiTests(SecurityAPITestBase):
    """SEC-LOGAPI-* : アクセスログの一覧・CSV出力 (/api/security/access-logs/)。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("security_api:access-log-list")
        self.export_url = reverse("security_api:access-log-export")

    def test_sec_logapi_01_admin_only(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.export_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_sec_logapi_02_list_with_filters(self):
        self.login()
        self.login(custom_id="nobody", password="wrong-password", ip="203.0.113.1")
        old = log_event(Event.LOGIN_SUCCESS, user=self.user)
        AccessLog.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=10))

        self.client.force_authenticate(self.staff_user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)
        self.assertIn({"value": "login_failed", "label": "ログイン失敗"}, response.data["event_types"])

        response = self.client.get(self.list_url, {"event_type": "login_failed"})
        self.assertEqual([row["username"] for row in response.data["results"]], ["nobody"])
        self.assertEqual(response.data["results"][0]["event_type_display"], "ログイン失敗")

        response = self.client.get(self.list_url, {"ip_address": "203.0.113"})
        self.assertEqual(response.data["count"], 1)

        today = timezone.localdate().isoformat()
        response = self.client.get(self.list_url, {"date_from": today, "event_type": "login_success"})
        self.assertEqual(response.data["count"], 1)

    def test_sec_logapi_03_export_csv_with_bom_and_logs_export(self):
        self.login(custom_id="nobody", password="wrong-password")
        self.client.force_authenticate(self.staff_user)
        response = self.client.get(self.export_url, {"event_type": "login_failed"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = b"".join(response.streaming_content).decode("utf-8")
        self.assertTrue(body.startswith("﻿日時,イベント"))
        self.assertIn("ログイン失敗,nobody," + CLIENT_IP, body)
        self.assertTrue(AccessLog.objects.filter(event_type=Event.ACCESS_LOG_EXPORTED, user=self.staff_user).exists())


@override_settings(LOGIN_CAPTCHA_THRESHOLD=100, LOGIN_IP_BLOCK_THRESHOLD=5)
class LockApiTests(SecurityAPITestBase):
    """SEC-LOCKAPI-* : ロック状況の確認と解除 (/api/security/locks/)。"""

    def test_sec_lockapi_01_list_and_unlock_user(self):
        self.fail_logins(5)
        self.client.force_authenticate(self.staff_user)

        response = self.client.get(reverse("security_api:lock-status"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["users"][0]["custom_id"], "testuser")
        self.assertTrue(response.data["users"][0]["is_locked"])
        self.assertEqual(response.data["ips"][0]["ip_address"], CLIENT_IP)

        url = reverse("security_api:unlock-user", args=[self.user.id])
        self.assertEqual(self.client.post(url).status_code, status.HTTP_200_OK)
        self.assertFalse(AccountLock.objects.filter(user=self.user).exists())
        log = AccessLog.objects.get(event_type=Event.ACCOUNT_UNLOCKED)
        self.assertEqual(log.user, self.staff_user)
        self.assertEqual(log.detail["target"], "testuser")
        self.assertEqual(self.client.post(url).status_code, status.HTTP_404_NOT_FOUND)

    def test_sec_lockapi_02_unblock_ip(self):
        self.fail_logins(5)
        block = IpBlock.objects.get(ip_address=CLIENT_IP)
        self.client.force_authenticate(self.staff_user)

        url = reverse("security_api:unblock-ip", args=[block.pk])
        self.assertEqual(self.client.post(url).status_code, status.HTTP_200_OK)
        self.assertFalse(IpBlock.objects.get(pk=block.pk).is_active())
        self.assertTrue(AccessLog.objects.filter(event_type=Event.IP_UNBLOCKED).exists())
        self.assertEqual(self.client.post(url).status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(None)
        AccountLock.objects.all().delete()
        self.assertEqual(self.login().status_code, status.HTTP_200_OK)

    def test_sec_lockapi_03_admin_only(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(reverse("security_api:lock-status")).status_code, status.HTTP_403_FORBIDDEN)
        url = reverse("security_api:unlock-user", args=[self.user.id])
        self.assertEqual(self.client.post(url).status_code, status.HTTP_403_FORBIDDEN)
