import uuid
from datetime import timedelta  # 追加

from django.conf import settings  # 追加 (有効期限日数をsettings.pyから取得する場合)
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.mail import send_mail  # email_userメソッドで必要
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


# マネージャー用
class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, custom_id, email, password, **extra_fields):
        if not custom_id:
            raise ValueError("専用IDは必須です。")
        user = self.model(custom_id=custom_id, email=email, **extra_fields)
        # パスワードを設定（これにより password_last_changed も更新される）
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, custom_id, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(custom_id, email, password, **extra_fields)

    def create_superuser(self, custom_id, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("スーパーユーザーは is_staff=True である必要があります。")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("スーパーユーザーは is_superuser=True である必要があります。")

        # email の正規化は CustomUser.save() で処理される
        return self._create_user(custom_id, email, password, **extra_fields)


# カスタムユーザー
class CustomUser(AbstractBaseUser, PermissionsMixin):
    class AccountType(models.TextChoices):
        HUMAN = "human", _("通常ユーザー")
        SYSTEM = "system", _("システム連携用")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # 専用IDフィールド
    custom_id = models.CharField(_("custom id"), max_length=50, unique=True, help_text=_("ログインに使用する専用ID。"))

    username_validator = UnicodeUsernameValidator()
    username = models.CharField(
        _("username"), max_length=150, blank=True, validators=[username_validator], help_text=_("表示用のユーザー名。")
    )

    first_name = models.CharField(_("first name"), max_length=150, blank=True)
    last_name = models.CharField(_("last name"), max_length=150, blank=True)
    email = models.EmailField(
        _("email address"), unique=True, blank=True, null=True
    )  # null=True を追加 (空文字ではなくNULLを許容する場合)

    is_staff = models.BooleanField(
        _("staff status"),
        default=False,
        help_text=_("管理サイトにログインできるかどうか。"),
    )
    is_active = models.BooleanField(_("active"), default=True, help_text=_("アクティブなユーザーかどうか。"))
    date_joined = models.DateTimeField(_("date joined"), default=timezone.now)

    account_type = models.CharField(
        _("account type"),
        max_length=10,
        choices=AccountType.choices,
        default=AccountType.HUMAN,
        help_text=_("通常ユーザーか、外部システム連携専用アカウントかの区分。"),
    )

    # --- パスワード有効期限関連の追加 ---
    password_last_changed = models.DateTimeField(
        _("password last changed"),
        default=timezone.now,  # 新規作成時は現在日時
        help_text=_("パスワードが最後に変更された日時。"),
    )
    # --- ここまで ---

    objects = UserManager()

    # ログインに使用するフィールドは専用ID
    USERNAME_FIELD = "custom_id"
    REQUIRED_FIELDS = []  # emailを必須項目から外す

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self):
        return self.custom_id

    def clean(self):
        super().clean()
        # emailがNoneの場合を考慮
        self.email = self.__class__.objects.normalize_email(self.email) if self.email else None

    def get_full_name(self):
        full_name = "%s %s" % (self.first_name, self.last_name)
        return full_name.strip()

    def get_short_name(self):
        return self.first_name

    def email_user(self, subject, message, from_email=None, **kwargs):
        # emailがNoneでないことを確認
        if self.email:
            send_mail(subject, message, from_email, [self.email], **kwargs)

    def save(self, *args, **kwargs):
        """
        保存前にemailフィールドを正規化し、空文字列をNoneに変換する。
        """
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email)
        else:
            self.email = None
        super().save(*args, **kwargs)

    # --- パスワード有効期限関連のメソッド追加 ---
    def set_password(self, raw_password):
        """
        パスワードを設定し、最終変更日時も更新する。
        """
        super().set_password(raw_password)
        self.password_last_changed = timezone.now()
        # set_password内では保存を行わないのがDjangoの慣例です。
        # 保存は呼び出し元の責任で行います。
        # if self.pk:
        #     self.save(update_fields=['password', 'password_last_changed'])

    @property
    def is_password_expired(self):
        """
        パスワードが有効期限切れかどうかを判定します。
        settings.PASSWORD_EXPIRATION_DAYS で日数を指定します（デフォルト180日）。
        """
        expiration_days = getattr(settings, "PASSWORD_EXPIRATION_DAYS", 180)  # settings.pyとデフォルト値を合わせる

        if expiration_days is None or expiration_days <= 0:
            # 有効期限が無効化されている場合は常に False
            return False

        if not self.password_last_changed:
            # password_last_changed がない場合 (通常は default=timezone.now で設定されるため稀)
            # 安全のため、またはポリシーに基づき期限切れとみなす
            return True

        expiration_date = self.password_last_changed + timedelta(days=expiration_days)
        expired = timezone.now() > expiration_date
        return expired

    # --- ここまで ---


# 外部連携用APIトークンに設定できるアクセススコープ。各APIアプリの app_name と一致させる。
API_SCOPE_CHOICES = [
    ("base_api", "基本設定"),
    ("inventory_api", "在庫管理"),
    ("machine_api", "設備管理"),
    ("master_api", "マスタ管理"),
    ("production_api", "生産管理"),
    ("quality_api", "品質管理"),
    ("users_api", "ユーザー管理"),
]


# ユーザーのAPIトークン（rest_framework.authtoken.Token）に付随するアクセス制御ポリシー
class ApiTokenPolicy(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_token_policy",
        verbose_name=_("対象ユーザー"),
    )
    is_active = models.BooleanField(_("トークン有効"), default=True)
    allowed_ips = models.TextField(
        _("接続許可IP"),
        blank=True,
        help_text=_("カンマまたは改行区切りでIPアドレスかCIDRを指定します。空欄の場合は制限しません。"),
    )
    scopes = models.JSONField(
        _("許可するAPIアプリ"),
        default=list,
        blank=True,
        help_text=_("空リストの場合は全アプリにアクセス可能です。"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("APIトークンポリシー")
        verbose_name_plural = _("APIトークンポリシー")

    def __str__(self):
        return f"{self.user_id} のAPIトークンポリシー"
