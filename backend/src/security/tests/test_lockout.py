from datetime import timedelta

from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from ..models import AccessLog, AccountLock, IpBlock
from .test_helpers import CLIENT_IP, DEFAULT_PASSWORD, OTHER_IP, SecurityAPITestBase

Event = AccessLog.EventType


# CAPTCHAが先に要求されないよう、しきい値を上げてアカウントロックだけを確認する
@override_settings(LOGIN_CAPTCHA_THRESHOLD=100, LOGIN_IP_BLOCK_THRESHOLD=100)
class AccountLockTests(SecurityAPITestBase):
    """SEC-LOCK-* : アカウント単位の段階的なロック。"""

    def _expire_lock(self):
        AccountLock.objects.filter(user=self.user).update(locked_until=timezone.now() - timedelta(seconds=1))

    def test_sec_lock_01_locks_after_threshold_failures(self):
        self.fail_logins(4)
        self.assertEqual(self.login().status_code, status.HTTP_200_OK, "しきい値未満ならロックされない")

        self.fail_logins(5)
        lock = AccountLock.objects.get(user=self.user)
        self.assertEqual(lock.lock_level, 1)
        self.assertAlmostEqual(lock.locked_until, timezone.now() + timedelta(minutes=5), delta=timedelta(seconds=30))
        self.assertTrue(AccessLog.objects.filter(event_type=Event.ACCOUNT_LOCKED, user=self.user).exists())

    def test_sec_lock_02_locked_account_rejects_correct_password_like_normal_failure(self):
        self.fail_logins(5)
        wrong = self.login(password="wrong-password")
        locked = self.login()

        self.assertEqual(locked.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(locked.data["error"], wrong.data["error"], "ロック中であることを応答から判別できない")
        self.assertEqual(AccountLock.objects.get(user=self.user).failure_count, 0, "ロック中の試行は数えない")
        self.assertTrue(AccessLog.objects.filter(event_type=Event.LOGIN_REJECTED, user=self.user).exists())

    def test_sec_lock_03_lock_duration_grows_then_requires_admin(self):
        self.fail_logins(5)
        self._expire_lock()
        self.fail_logins(5)
        lock = AccountLock.objects.get(user=self.user)
        self.assertEqual(lock.lock_level, 2)
        self.assertAlmostEqual(lock.locked_until, timezone.now() + timedelta(minutes=30), delta=timedelta(seconds=30))

        self._expire_lock()
        self.fail_logins(5)
        lock.refresh_from_db()
        self.assertTrue(lock.requires_admin_unlock)
        self.assertIsNone(lock.locked_until)
        self.assertEqual(self.login().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sec_lock_04_success_after_expiry_resets_stage(self):
        self.fail_logins(5)
        self._expire_lock()
        self.assertEqual(self.login().status_code, status.HTTP_200_OK)
        self.assertFalse(AccountLock.objects.filter(user=self.user).exists())

        self.fail_logins(5)
        self.assertEqual(AccountLock.objects.get(user=self.user).lock_level, 1, "最初の段階(5分)からやり直す")

    def test_sec_lock_05_unknown_user_is_logged_without_lock_record(self):
        response = self.login(custom_id="nobody")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(AccountLock.objects.count(), 0)
        log = AccessLog.objects.get(event_type=Event.LOGIN_FAILED)
        self.assertEqual(log.username, "nobody")
        self.assertEqual(log.detail["reason"], "unknown_user")
        self.assertEqual(log.ip_address, CLIENT_IP)

    def test_sec_lock_06_token_auth_endpoint_is_also_protected(self):
        url = reverse("api_token_auth")
        self.fail_logins(5)
        response = self.client.post(
            url, {"username": "testuser", "password": DEFAULT_PASSWORD}, format="json", REMOTE_ADDR=CLIENT_IP
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("token", response.data)


@override_settings(LOGIN_CAPTCHA_THRESHOLD=100, LOGIN_IP_BLOCK_THRESHOLD=6, LOGIN_LOCK_THRESHOLD=100)
class IpBlockTests(SecurityAPITestBase):
    """SEC-IP-* : IP単位のブロック。"""

    def test_sec_ip_01_blocks_ip_regardless_of_username(self):
        for index in range(6):
            self.login(custom_id=f"user{index}", password="wrong-password")

        self.assertTrue(IpBlock.objects.filter(ip_address=CLIENT_IP, blocked_until__gt=timezone.now()).exists())
        self.assertEqual(self.login().status_code, status.HTTP_401_UNAUTHORIZED, "正しいパスワードでも拒否する")
        self.assertEqual(self.login(ip=OTHER_IP).status_code, status.HTTP_200_OK, "他のIPには影響しない")
        rejected = AccessLog.objects.filter(event_type=Event.LOGIN_REJECTED, ip_address=CLIENT_IP).first()
        self.assertEqual(rejected.detail["reason"], "ip_blocked")

    def test_sec_ip_02_failures_before_unblock_are_not_counted_again(self):
        self.fail_logins(6)
        # ブロック前の失敗を2分前、ブロック期限を1分前に戻す(ブロックが解けた状態)
        AccessLog.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        IpBlock.objects.filter(ip_address=CLIENT_IP).update(blocked_until=timezone.now() - timedelta(minutes=1))

        self.fail_logins(1)
        self.assertEqual(self.login().status_code, status.HTTP_200_OK, "ブロックが解けた直後に再ブロックしない")

    def test_sec_ip_03_old_failures_outside_window_are_ignored(self):
        self.fail_logins(5)
        AccessLog.objects.filter(event_type=Event.LOGIN_FAILED).update(
            created_at=timezone.now() - timedelta(minutes=31)
        )
        self.fail_logins(1)
        self.assertFalse(IpBlock.objects.exists())
