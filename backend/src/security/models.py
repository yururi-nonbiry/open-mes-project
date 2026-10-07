from django.conf import settings
from django.db import models
from django.utils import timezone


class AccessLog(models.Model):
    """ログインの成否や重要な操作を記録する監査ログ。"""

    class EventType(models.TextChoices):
        LOGIN_SUCCESS = "login_success", "ログイン成功"
        LOGIN_FAILED = "login_failed", "ログイン失敗"
        LOGIN_REJECTED = "login_rejected", "ログイン拒否（ロック中）"
        ACCOUNT_LOCKED = "account_locked", "アカウントロック"
        ACCOUNT_UNLOCKED = "account_unlocked", "アカウントロック解除"
        IP_BLOCKED = "ip_blocked", "IPブロック"
        IP_UNBLOCKED = "ip_unblocked", "IPブロック解除"
        TOKEN_REFRESH_FAILED = "token_refresh_failed", "トークン更新失敗"
        PERMISSION_DENIED = "permission_denied", "権限エラー"
        USER_CREATED = "user_created", "ユーザー作成"
        USER_UPDATED = "user_updated", "ユーザー更新"
        USER_DELETED = "user_deleted", "ユーザー削除"
        PROFILE_UPDATED = "profile_updated", "プロフィール更新"
        PASSWORD_CHANGED = "password_changed", "パスワード変更"
        API_TOKEN_REGENERATED = "api_token_regenerated", "APIトークン再発行"
        API_TOKEN_POLICY_UPDATED = "api_token_policy_updated", "APIトークンポリシー更新"
        CSV_IMPORTED = "csv_imported", "CSV取込"
        CSV_IMPORT_CANCELLED = "csv_import_cancelled", "CSV取込の取消"
        SETTINGS_CHANGED = "settings_changed", "設定変更"
        ACCESS_LOG_EXPORTED = "access_log_exported", "アクセスログ出力"

    created_at = models.DateTimeField("日時", default=timezone.now, db_index=True)
    event_type = models.CharField("イベント", max_length=40, choices=EventType.choices, db_index=True)
    # 操作したユーザー。ログイン失敗時は特定できたユーザー(存在しないIDの場合は空)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="access_logs",
        verbose_name="ユーザー",
    )
    # ユーザー削除後やログイン失敗時でも追跡できるよう、入力されたIDを文字列でも残す
    username = models.CharField("ユーザーID", max_length=150, blank=True)
    ip_address = models.GenericIPAddressField("IPアドレス", null=True, blank=True)
    user_agent = models.CharField("ユーザーエージェント", max_length=255, blank=True)
    method = models.CharField("メソッド", max_length=10, blank=True)
    path = models.CharField("パス", max_length=255, blank=True)
    status_code = models.PositiveSmallIntegerField("ステータス", null=True, blank=True)
    detail = models.JSONField("詳細", default=dict, blank=True)

    class Meta:
        verbose_name = "アクセスログ"
        verbose_name_plural = "アクセスログ"
        ordering = ["-created_at", "-id"]
        indexes = [
            # IP単位の失敗回数の集計に使う
            models.Index(fields=["event_type", "ip_address", "created_at"], name="security_log_ip_event_idx"),
        ]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M:%S} {self.event_type} {self.username}"


class AccountLock(models.Model):
    """
    アカウント単位のログイン失敗回数とロック状態。
    lock_level は連続してロックされた回数で、ロック期間の段階を表す。ログインに成功すると行ごと削除する。
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_lock",
        verbose_name="ユーザー",
    )
    failure_count = models.PositiveIntegerField("連続失敗回数", default=0)
    lock_level = models.PositiveIntegerField("ロック段階", default=0)
    locked_until = models.DateTimeField("ロック期限", null=True, blank=True)
    requires_admin_unlock = models.BooleanField("管理者による解除が必要", default=False)
    last_failure_at = models.DateTimeField("最終失敗日時", null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "アカウントロック"
        verbose_name_plural = "アカウントロック"

    def __str__(self):
        return f"{self.user} のロック状態"

    def is_locked(self, now=None):
        if self.requires_admin_unlock:
            return True
        now = now or timezone.now()
        return self.locked_until is not None and self.locked_until > now


class IpBlock(models.Model):
    """
    IPアドレス単位のブロック状態。
    解除後も行を残し、blocked_until 以前の失敗は以後の集計に含めない(解除直後に再ブロックされないようにする)。
    """

    ip_address = models.GenericIPAddressField("IPアドレス", unique=True)
    blocked_until = models.DateTimeField("ブロック期限")
    failure_count = models.PositiveIntegerField("ブロック時の失敗回数", default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "IPブロック"
        verbose_name_plural = "IPブロック"

    def __str__(self):
        return f"{self.ip_address} ({self.blocked_until:%Y-%m-%d %H:%M})"

    def is_active(self, now=None):
        return self.blocked_until > (now or timezone.now())
