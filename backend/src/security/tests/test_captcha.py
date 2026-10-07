from captcha.models import CaptchaStore
from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from ..models import AccountLock
from .test_helpers import OTHER_IP, SecurityAPITestBase


def solve(key):
    return CaptchaStore.objects.get(hashkey=key).response


@override_settings(LOGIN_CAPTCHA_THRESHOLD=3, LOGIN_IP_BLOCK_THRESHOLD=100, LOGIN_LOCK_THRESHOLD=100)
class LoginCaptchaTests(SecurityAPITestBase):
    """SEC-CAPTCHA-* : ログイン失敗が続いたIPへのCAPTCHA。"""

    def setUp(self):
        super().setUp()
        self.captcha_url = reverse("security_api:captcha")

    def _new_captcha(self):
        response = self.client.get(self.captcha_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["key"]

    def test_sec_captcha_01_issue_returns_key_and_png(self):
        response = self.client.get(self.captcha_url, HTTP_AUTHORIZATION="Bearer invalid-token")
        self.assertEqual(response.status_code, status.HTTP_200_OK, "壊れたトークンが残っていても取得できる")
        self.assertTrue(response.data["image"].startswith("data:image/png;base64,"))
        self.assertTrue(CaptchaStore.objects.filter(hashkey=response.data["key"]).exists())

    def test_sec_captcha_02_required_after_threshold(self):
        self.fail_logins(2)
        response = self.login(password="wrong-password")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(response.data["captcha_required"])

        # CAPTCHAなしでは、パスワードが正しくても認証まで進まない
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "captcha_invalid")
        self.assertEqual(AccountLock.objects.get(user=self.user).failure_count, 3, "アカウントの失敗回数は増えない")

    def test_sec_captcha_03_correct_answer_logs_in_and_is_single_use(self):
        self.fail_logins(3)
        key = self._new_captcha()
        answer = solve(key)

        response = self.login(captcha_key=key, captcha_value=answer.upper())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertFalse(CaptchaStore.objects.filter(hashkey=key).exists())

        self.fail_logins(3)
        response = self.login(captcha_key=key, captcha_value=answer)
        self.assertEqual(response.data["code"], "captcha_invalid", "使用済みのCAPTCHAは再利用できない")

    def test_sec_captcha_04_wrong_answer_consumes_captcha(self):
        self.fail_logins(3)
        key = self._new_captcha()
        answer = solve(key)
        response = self.login(captcha_key=key, captcha_value="zzzzz")
        self.assertEqual(response.data["code"], "captcha_invalid")
        response = self.login(captcha_key=key, captcha_value=answer)
        self.assertEqual(response.data["code"], "captcha_invalid")

    def test_sec_captcha_05_decided_per_ip_not_per_username(self):
        self.fail_logins(2, custom_id="nobody")
        existing = self.login(password="wrong-password")
        self.fail_logins(2, custom_id="nobody", ip=OTHER_IP)
        missing = self.login(custom_id="another-nobody", password="wrong-password", ip=OTHER_IP)
        self.assertTrue(existing.data["captcha_required"])
        self.assertEqual(existing.data, missing.data, "ユーザーIDの有無で応答が変わらない")

        response = self.login(ip="198.51.100.30")
        self.assertEqual(response.status_code, status.HTTP_200_OK, "他のIPには要求しない")

    def test_sec_captcha_06_success_resets_requirement(self):
        self.fail_logins(3)
        key = self._new_captcha()
        self.login(captcha_key=key, captcha_value=solve(key))
        response = self.login(password="wrong-password")
        self.assertFalse(response.data["captcha_required"])
