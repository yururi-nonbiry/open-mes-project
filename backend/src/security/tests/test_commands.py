from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.utils import timezone

from ..audit import log_event
from ..models import AccessLog, AccountLock, IpBlock
from .test_helpers import CLIENT_IP, SecurityAPITestBase

Event = AccessLog.EventType


def run(*args):
    out = StringIO()
    call_command(*args, stdout=out)
    return out.getvalue()


@override_settings(LOGIN_CAPTCHA_THRESHOLD=100, LOGIN_IP_BLOCK_THRESHOLD=5)
class ManagementCommandTests(SecurityAPITestBase):
    """SEC-CMD-* : 管理コマンド (unlock_user / unblock_ip / purge_access_logs)。"""

    def test_sec_cmd_01_unlock_user(self):
        self.fail_logins(5)
        self.assertIn("testuser", run("unlock_user", "--list"))
        self.assertIn("解除しました", run("unlock_user", "testuser"))
        self.assertFalse(AccountLock.objects.exists())
        self.assertEqual(AccessLog.objects.get(event_type=Event.ACCOUNT_UNLOCKED).detail["by"], "command")
        with self.assertRaises(CommandError):
            run("unlock_user", "nobody")

    def test_sec_cmd_02_unlock_all(self):
        self.fail_logins(5)
        self.fail_logins(5, custom_id="staffuser", ip="203.0.113.2")
        run("unlock_user", "--all")
        self.assertFalse(AccountLock.objects.exists())

    def test_sec_cmd_03_unblock_ip(self):
        self.fail_logins(5)
        self.assertIn(CLIENT_IP, run("unblock_ip", "--list"))
        self.assertIn("解除しました", run("unblock_ip", CLIENT_IP))
        self.assertFalse(IpBlock.objects.get(ip_address=CLIENT_IP).is_active())
        self.assertIn("ありません", run("unblock_ip", "--list"))

    def test_sec_cmd_04_purge_access_logs(self):
        old = log_event(Event.LOGIN_SUCCESS, user=self.user)
        AccessLog.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=400))
        recent = log_event(Event.LOGIN_SUCCESS, user=self.user)

        self.assertIn("1 件", run("purge_access_logs"))
        self.assertEqual(list(AccessLog.objects.values_list("pk", flat=True)), [recent.pk])
        with self.assertRaises(CommandError):
            run("purge_access_logs", "--days", "0")
