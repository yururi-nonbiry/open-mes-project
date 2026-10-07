from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

from . import lockout
from .audit import get_client_ip, log_event
from .models import AccessLog

Event = AccessLog.EventType


class LockoutModelBackend(ModelBackend):
    """
    ModelBackend にアカウントロック・IPブロックと、ログイン成否の監査ログを加えた認証バックエンド。
    authenticate() を経由するログイン(JWT取得・トークン取得)はすべてここを通る。
    APIトークン(Token ヘッダー)による認証は authenticate() を経由しないため対象外。

    ロック中・ブロック中はパスワードが正しくても None を返し、通常の失敗と区別できない応答にする。
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if username is None or password is None:
            return None

        ip = get_client_ip(request)
        if lockout.is_ip_blocked(ip):
            # 応答時間からブロック中かどうかを推測されないよう、パスワード照合と同程度の処理を行う
            UserModel().set_password(password)
            log_event(Event.LOGIN_REJECTED, request, user=None, username=username, detail={"reason": "ip_blocked"})
            return None

        try:
            user = UserModel._default_manager.get_by_natural_key(username)
        except UserModel.DoesNotExist:
            UserModel().set_password(password)
            self._record_failure(request, ip, username, None, "unknown_user")
            return None

        if lockout.is_user_locked(user):
            UserModel().set_password(password)
            log_event(Event.LOGIN_REJECTED, request, user=user, detail={"reason": "account_locked"})
            return None

        if not user.check_password(password):
            self._record_failure(request, ip, username, user, "bad_password")
            return None
        if not self.user_can_authenticate(user):
            self._record_failure(request, ip, username, user, "inactive")
            return None

        lockout.register_success(user)
        log_event(Event.LOGIN_SUCCESS, request, user=user)
        return user

    def _record_failure(self, request, ip, username, user, reason):
        log_event(Event.LOGIN_FAILED, request, user=user, username=username, detail={"reason": reason})
        if user is not None and reason == "bad_password":
            lockout.register_failure(user, request)
        lockout.register_ip_failure(ip, request)
