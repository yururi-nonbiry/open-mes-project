"""
ログイン画面のCAPTCHA。

同じIPからのログイン失敗が LOGIN_CAPTCHA_THRESHOLD 回に達すると要求する。ユーザーIDの有無を推測されないよう、
要否はユーザー単位ではなくIP単位で判定する。1つの画像で答えられるのは1回だけ(照合時に削除する)。
"""

import base64

from captcha.models import CaptchaStore
from captcha.views import captcha_image
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed

from . import lockout
from .audit import get_client_ip, log_event
from .models import AccessLog

CAPTCHA_INVALID_MESSAGE = "画像に表示された文字を正しく入力してください。"


def is_required(request):
    ip = get_client_ip(request)
    return lockout.count_ip_failures_since_success(ip) >= settings.LOGIN_CAPTCHA_THRESHOLD


def generate():
    """新しいCAPTCHAを作り、照合用のキーとPNG画像(data URL)を返す。"""
    CaptchaStore.remove_expired()
    key = CaptchaStore.generate_key()
    response = captcha_image(None, key)
    image = base64.b64encode(response.content).decode("ascii")
    return {"key": key, "image": f"data:image/png;base64,{image}"}


def verify(key, value):
    """答えを照合する。正誤にかかわらず、そのキーは使えなくなる。"""
    if not key or not value:
        return False
    store = CaptchaStore.objects.filter(hashkey=str(key)).first()
    # 同じキーで同時に送られた場合も、削除できた1件だけを照合する
    if store is None or not CaptchaStore.objects.filter(pk=store.pk).delete()[0]:
        return False
    return store.expiration > timezone.now() and store.response == str(value).strip().lower()


class CaptchaProtectedLoginMixin:
    """
    ログイン用のAPIビューに組み込むMixin。
    - CAPTCHAが必要な状態では、captcha_key / captcha_value を照合してから認証する
    - 失敗時(400/401)の応答に、次の試行でCAPTCHAが必要かどうかを captcha_required として付ける
    """

    def post(self, request, *args, **kwargs):
        if is_required(request) and not verify(request.data.get("captcha_key"), request.data.get("captcha_value")):
            username = request.data.get(get_user_model().USERNAME_FIELD) or request.data.get("username") or ""
            log_event(
                AccessLog.EventType.LOGIN_FAILED,
                request,
                user=None,
                username=str(username),
                detail={"reason": "captcha"},
            )
            lockout.register_ip_failure(get_client_ip(request), request)
            raise AuthenticationFailed(CAPTCHA_INVALID_MESSAGE, code="captcha_invalid")
        return super().post(request, *args, **kwargs)

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if response.status_code in (400, 401) and isinstance(response.data, dict):
            response.data["captcha_required"] = is_required(self.request)
        return response
