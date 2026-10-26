import ipaddress

from django.contrib.auth import authenticate, get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import API_SCOPE_CHOICES, ApiTokenPolicy

CustomUser = get_user_model()


def revoke_refresh_tokens(user):
    """未失効のリフレッシュトークンをすべて失効させ、既存のJWTセッションに再ログインを求める"""
    outstanding = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create([BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True)


class CustomUserSerializer(serializers.ModelSerializer):
    """ユーザーオブジェクト用のシリアライザー"""

    class Meta:
        model = CustomUser
        fields = ("custom_id", "username", "email", "password")
        extra_kwargs = {"password": {"write_only": True, "min_length": 5}}

    def create(self, validated_data):
        """暗号化されたパスワードで新しいユーザーを作成して返す"""
        return CustomUser.objects.create_user(**validated_data)


class CustomAuthTokenSerializer(serializers.Serializer):
    """ユーザー認証オブジェクト用のシリアライザー"""

    custom_id = serializers.CharField(label=_("Custom ID"))
    password = serializers.CharField(label=_("Password"), style={"input_type": "password"}, trim_whitespace=False)

    def validate(self, attrs):
        custom_id = attrs.get("custom_id")
        password = attrs.get("password")
        UserModel = get_user_model()

        if not (custom_id and password):
            msg = _('"custom_id" と "password" を含める必要があります。')
            raise serializers.ValidationError(msg, code="authorization")

        # Djangoの標準認証関数を使用
        user = authenticate(request=self.context.get("request"), username=custom_id, password=password)

        # authenticateがNoneを返した場合、ログイン失敗の理由を特定する
        if not user:
            try:
                # ユーザーが存在するかどうかを確認
                user_obj = UserModel.objects.get(custom_id=custom_id)

                # ユーザーは存在するが、パスワードが違うか、アカウントが無効
                if not user_obj.check_password(password):
                    msg = _("パスワードが正しくありません。")
                    raise serializers.ValidationError(msg, code="authorization")
                elif not user_obj.is_active:
                    msg = _("このアカウントは無効化されています。")
                    raise serializers.ValidationError(msg, code="authorization")
                else:
                    # その他の理由で認証に失敗した場合
                    msg = _("提供された認証情報でログインできません。")
                    raise serializers.ValidationError(msg, code="authorization")

            except UserModel.DoesNotExist:
                # ユーザーID自体が存在しない
                msg = _("指定されたIDのユーザーは存在しません。")
                raise serializers.ValidationError(msg, code="authorization") from None

        attrs["user"] = user
        return attrs


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """認証失敗時のエラーメッセージを日本語化するJWT取得用シリアライザー"""

    default_error_messages = {
        "no_active_account": _("指定されたIDまたはパスワードが正しくありません。"),
    }


class AdminUserSerializer(serializers.ModelSerializer):
    """管理者によるユーザー管理用のシリアライザー"""

    password = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=5)

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "custom_id",
            "username",
            "email",
            "password",
            "account_type",
            "is_staff",
            "is_superuser",
            "is_active",
            "date_joined",
            "last_login",
            "password_last_changed",
        ]
        read_only_fields = ["id", "date_joined", "last_login", "password_last_changed"]

    def validate_is_superuser(self, value):
        # スーパーユーザーでないスタッフが自分や他人をスーパーユーザーにする権限昇格を防ぐ
        request = self.context.get("request")
        current = self.instance.is_superuser if self.instance else False
        if value != current and not (request and request.user.is_superuser):
            raise serializers.ValidationError("スーパーユーザー権限を変更できるのはスーパーユーザーのみです。")
        return value

    def create(self, validated_data):
        """暗号化されたパスワードで新しいユーザーを作成して返す"""
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "パスワードは必須です。"})
        return CustomUser.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        """パスワードが指定された場合のみ、ハッシュ化して更新する"""
        password = validated_data.pop("password", None)
        instance = super().update(instance, validated_data)
        if password:
            instance.set_password(password)
            instance.save(update_fields=["password", "password_last_changed"])
            # 盗まれたトークンが使い続けられないよう、パスワード変更時は既存のセッションを失効させる
            revoke_refresh_tokens(instance)
        return instance


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """ユーザープロファイル更新用のシリアライザー"""

    class Meta:
        model = CustomUser
        fields = ["username", "email"]


class PasswordChangeSerializer(serializers.Serializer):
    """パスワード変更エンドポイント用のシリアライザー"""

    old_password = serializers.CharField(required=True)
    new_password1 = serializers.CharField(required=True)
    new_password2 = serializers.CharField(required=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError(_("現在のパスワードが正しくありません。"))
        return value

    def validate(self, data):
        if data["new_password1"] != data["new_password2"]:
            raise serializers.ValidationError({"new_password2": _("2つのパスワードフィールドが一致しません。")})
        # ユーザー属性との類似チェックも働くよう、対象ユーザーを渡してDjangoのパスワードバリデーションを行う
        try:
            password_validation.validate_password(data["new_password1"], self.context["request"].user)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"new_password1": list(e.messages)}) from None
        return data


class ApiTokenPolicySerializer(serializers.ModelSerializer):
    """管理者による外部連携用APIトークンのアクセス制御ポリシー編集用シリアライザー"""

    class Meta:
        model = ApiTokenPolicy
        fields = ["is_active", "allowed_ips", "scopes", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_allowed_ips(self, value):
        for line in value.replace(",", "\n").splitlines():
            entry = line.strip()
            if not entry:
                continue
            try:
                ipaddress.ip_network(entry, strict=False)
            except ValueError:
                raise serializers.ValidationError(f"'{entry}' はIPアドレスまたはCIDR表記として不正です。") from None
        return value

    def validate_scopes(self, value):
        valid_keys = {key for key, _label in API_SCOPE_CHOICES}
        invalid = sorted(set(value) - valid_keys)
        if invalid:
            raise serializers.ValidationError(f"不正なスコープが含まれています: {', '.join(invalid)}")
        return value
