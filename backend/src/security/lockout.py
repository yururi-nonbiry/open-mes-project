"""
ログイン失敗の集計と、アカウントのロック・IPのブロック。

- アカウント: LOGIN_LOCK_THRESHOLD 回連続で失敗するとロックする。ロック期間は LOGIN_LOCK_DURATIONS_MINUTES の
  順に長くなり、最後の段階を超えると管理者が解除するまでロックしたままにする。ログインに成功すると最初の段階に戻る。
- IP: LOGIN_IP_BLOCK_WINDOW_MINUTES 分以内に、ユーザーIDを問わず LOGIN_IP_BLOCK_THRESHOLD 回失敗すると
  LOGIN_IP_BLOCK_MINUTES 分ブロックする。失敗回数は監査ログ(AccessLog)から数える。
- ロック中・ブロック中の試行は失敗回数に数えない(ロック期間を延ばさない)。
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .audit import log_event
from .models import AccessLog, AccountLock, IpBlock

Event = AccessLog.EventType


# --- アカウント ---


def is_user_locked(user, now=None):
    lock = AccountLock.objects.filter(user=user).first()
    return lock is not None and lock.is_locked(now)


def register_failure(user, request=None):
    """パスワード誤りを1回数え、しきい値に達したらロックする。更新後の AccountLock を返す。"""
    now = timezone.now()
    durations = settings.LOGIN_LOCK_DURATIONS_MINUTES
    with transaction.atomic():
        lock, _ = AccountLock.objects.select_for_update().get_or_create(user=user)
        lock.failure_count += 1
        lock.last_failure_at = now
        locked = lock.failure_count >= settings.LOGIN_LOCK_THRESHOLD
        if locked:
            lock.failure_count = 0
            if lock.lock_level < len(durations):
                lock.locked_until = now + timedelta(minutes=durations[lock.lock_level])
            else:
                lock.locked_until = None
                lock.requires_admin_unlock = True
            lock.lock_level += 1
        lock.save()

    if locked:
        log_event(
            Event.ACCOUNT_LOCKED,
            request,
            user=user,
            detail={
                "lock_level": lock.lock_level,
                "locked_until": lock.locked_until.isoformat() if lock.locked_until else None,
                "requires_admin_unlock": lock.requires_admin_unlock,
            },
        )
    return lock


def register_success(user):
    """ログイン成功時に失敗回数とロック段階を初期状態に戻す。"""
    AccountLock.objects.filter(user=user).delete()


def unlock_user(user, request=None, actor=None):
    """管理者によるロック解除。ロック情報があった場合は True を返す。"""
    deleted, _ = AccountLock.objects.filter(user=user).delete()
    if deleted:
        log_event(
            Event.ACCOUNT_UNLOCKED,
            request,
            user=actor,
            username=actor.get_username() if actor else "",
            detail={"target": user.get_username(), "by": "admin" if actor else "command"},
        )
    return bool(deleted)


# --- IP ---


def is_ip_blocked(ip, now=None):
    if not ip:
        return False
    return IpBlock.objects.filter(ip_address=ip, blocked_until__gt=now or timezone.now()).exists()


def _count_since(ip, now):
    """集計期間の開始時刻。直近のブロックが解けた時刻より前の失敗は数えない。"""
    since = now - timedelta(minutes=settings.LOGIN_IP_BLOCK_WINDOW_MINUTES)
    block = IpBlock.objects.filter(ip_address=ip).first()
    if block is not None and block.blocked_until > since:
        since = block.blocked_until
    return since


def count_ip_failures(ip, now=None):
    if not ip:
        return 0
    now = now or timezone.now()
    return AccessLog.objects.filter(
        event_type=Event.LOGIN_FAILED, ip_address=ip, created_at__gt=_count_since(ip, now)
    ).count()


def count_ip_failures_since_success(ip, now=None):
    """CAPTCHAの要否判定用。そのIPから最後にログインに成功した後の失敗回数を返す。"""
    if not ip:
        return 0
    now = now or timezone.now()
    since = _count_since(ip, now)
    last_success = AccessLog.objects.filter(
        event_type=Event.LOGIN_SUCCESS, ip_address=ip, created_at__gt=since
    ).aggregate(last=Max("created_at"))["last"]
    if last_success is not None:
        since = last_success
    return AccessLog.objects.filter(event_type=Event.LOGIN_FAILED, ip_address=ip, created_at__gt=since).count()


def register_ip_failure(ip, request=None):
    """ログイン失敗を監査ログに記録した後に呼ぶ。しきい値に達したらブロックし、True を返す。"""
    if not ip:
        return False
    now = timezone.now()
    count = count_ip_failures(ip, now)
    if count < settings.LOGIN_IP_BLOCK_THRESHOLD:
        return False
    blocked_until = now + timedelta(minutes=settings.LOGIN_IP_BLOCK_MINUTES)
    IpBlock.objects.update_or_create(ip_address=ip, defaults={"blocked_until": blocked_until, "failure_count": count})
    log_event(
        Event.IP_BLOCKED,
        request,
        user=None,
        username="",
        detail={"ip_address": ip, "failure_count": count, "blocked_until": blocked_until.isoformat()},
    )
    return True


def unblock_ip(block, request=None, actor=None):
    """IPブロックを解除する。行は残し、解除時刻以前の失敗を以後の集計から外す。"""
    now = timezone.now()
    was_active = block.is_active(now)
    block.blocked_until = now
    block.save(update_fields=["blocked_until", "updated_at"])
    if was_active:
        log_event(
            Event.IP_UNBLOCKED,
            request,
            user=actor,
            username=actor.get_username() if actor else "",
            detail={"ip_address": block.ip_address, "by": "admin" if actor else "command"},
        )
    return was_active
