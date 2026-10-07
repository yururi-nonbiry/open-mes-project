"""
監査ログの記録と、アクセス元IPの判定。

log_event() は記録に失敗しても例外を送出しない。監査ログの不具合でログインや業務処理を止めないため。
"""

import ipaddress
import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import AccessLog, IpBlock

logger = logging.getLogger(__name__)

# ユーザーの変更内容として記録する項目。パスワードは値を残さず「変更したかどうか」だけを記録する
USER_AUDIT_FIELDS = ("custom_id", "username", "email", "account_type", "is_staff", "is_superuser", "is_active")


def _valid_ip(value):
    if not value:
        return None
    value = value.strip()
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return None
    return value


def get_client_ip(request):
    """
    アクセス元のIPアドレスを返す。判定できない場合は None。

    TRUST_X_REAL_IP が有効な場合は、リバースプロキシ(nginx)が上書きする X-Real-IP を使う。
    X-Forwarded-For はクライアントが任意の値を送れるため使わない。
    """
    if request is None:
        return None
    meta = request.META
    if getattr(settings, "TRUST_X_REAL_IP", False):
        real_ip = _valid_ip(meta.get("HTTP_X_REAL_IP"))
        if real_ip:
            return real_ip
    return _valid_ip(meta.get("REMOTE_ADDR"))


def _request_user(request):
    try:
        user = getattr(request, "user", None)
    except Exception:  # DRFのRequestは参照時に認証を行うため、認証エラーで例外になることがある
        return None
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    return None


def log_event(event_type, request=None, *, user=None, username=None, status_code=None, detail=None):
    """監査ログを1件記録する。記録に失敗した場合はログ出力のみ行い None を返す。"""
    try:
        if user is None and request is not None:
            user = _request_user(request)
        if username is None:
            username = user.get_username() if user is not None else ""
        fields = {
            "event_type": event_type,
            "user": user,
            "username": str(username)[:150],
            "status_code": status_code,
            "detail": detail or {},
        }
        if request is not None:
            fields.update(
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
                method=request.method or "",
                path=request.path[:255],
            )
        # 呼び出し元のトランザクションを壊さないよう、セーブポイント内で記録する
        with transaction.atomic():
            return AccessLog.objects.create(**fields)
    except Exception:
        logger.exception("監査ログの記録に失敗しました: %s", event_type)
        return None


def snapshot(instance, fields=USER_AUDIT_FIELDS):
    """監査ログに残すため、モデルの指定項目をJSONにできる値で取り出す。"""
    data = {}
    for field in fields:
        value = getattr(instance, field, None)
        data[field] = value if value is None or isinstance(value, (bool, int, float, str, list, dict)) else str(value)
    return data


def diff(before, after):
    """2つのスナップショットの差分を {項目: {"before": 変更前, "after": 変更後}} で返す。"""
    return {
        key: {"before": before.get(key), "after": after.get(key)}
        for key in sorted(set(before) | set(after))
        if before.get(key) != after.get(key)
    }


def purge_expired(days=None):
    """
    保存期間(ACCESS_LOG_RETENTION_DAYS)を過ぎた監査ログと、期限切れのIPブロック・CAPTCHAを削除する。
    削除した監査ログの件数を返す。
    """
    from captcha.models import CaptchaStore

    days = settings.ACCESS_LOG_RETENTION_DAYS if days is None else days
    cutoff = timezone.now() - timedelta(days=days)
    deleted, _ = AccessLog.objects.filter(created_at__lt=cutoff).delete()
    # ブロック期限から集計期間が過ぎた行は、失敗回数の集計に影響しないため削除してよい
    window = timedelta(minutes=settings.LOGIN_IP_BLOCK_WINDOW_MINUTES)
    IpBlock.objects.filter(blocked_until__lt=timezone.now() - window).delete()
    CaptchaStore.remove_expired()
    return deleted
