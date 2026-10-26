import logging

from django.contrib.auth import login, logout, update_session_auth_hash
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie, requires_csrf_token
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken as DefaultObtainAuthToken
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from security.audit import diff, log_event, snapshot
from security.login_captcha import CaptchaProtectedLoginMixin
from security.models import AccessLog

from .models import ApiTokenPolicy, CustomUser
from .serializers import (
    AdminUserSerializer,
    ApiTokenPolicySerializer,
    CustomAuthTokenSerializer,
    CustomTokenObtainPairSerializer,
    CustomUserSerializer,
    PasswordChangeSerializer,
    UserProfileUpdateSerializer,
    revoke_refresh_tokens,
)

logger = logging.getLogger(__name__)


@requires_csrf_token
def csrf_failure(request, reason=""):
    """
    CSRF検証が失敗したときに呼び出されるカスタムビュー。
    デバッグに役立つ情報をログに出力し、JSONレスポンスを返します。
    """
    referer = request.META.get("HTTP_REFERER")
    host = request.get_host()
    logger.warning(f"CSRF verification failed. Reason: {reason}. Referer: {referer}. Host: {host}")

    return JsonResponse({"error": "CSRF verification failed.", "reason": reason}, status=403)


@api_view(["POST"])
def register_user(request):
    serializer = CustomUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()  # serializer.save() returns the created user instance
    token, created = Token.objects.get_or_create(user=user)  # Get or create token
    return Response(
        {
            "message": "ユーザー登録が完了しました",
            "token": token.key,  # Include token in the response
        },
        status=status.HTTP_201_CREATED,
    )


class CustomObtainAuthToken(DefaultObtainAuthToken):
    """
    Custom token authentication view that uses our custom serializer.
    This allows the API to explicitly expect 'custom_id' instead of 'username'.
    """

    serializer_class = CustomAuthTokenSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        # Start a session upon successful authentication
        login(request, user)
        token, created = Token.objects.get_or_create(user=user)
        user_data = CustomUserSerializer(user).data
        return Response({"token": token.key, "user": user_data})


class CustomTokenObtainPairView(CaptchaProtectedLoginMixin, TokenObtainPairView):
    """
    認証失敗時のエラーメッセージを日本語化したJWT取得ビュー。
    同じIPからの失敗が続いた場合はCAPTCHAを求める(security/login_captcha.py 参照)。
    """

    serializer_class = CustomTokenObtainPairSerializer


class CaptchaObtainAuthToken(CaptchaProtectedLoginMixin, DefaultObtainAuthToken):
    """固定APIトークンの取得ビュー(/api/token-auth/)。JWT取得と同様にCAPTCHAの対象とする。"""


class AuditedTokenRefreshView(TokenRefreshView):
    """リフレッシュトークンによるアクセストークン更新。失敗を監査ログに記録する。"""

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if response.status_code in (400, 401):
            data = response.data if isinstance(response.data, dict) else {}
            log_event(
                AccessLog.EventType.TOKEN_REFRESH_FAILED,
                self.request,
                user=None,
                username="",
                status_code=response.status_code,
                detail={"error": data.get("error", ""), "code": data.get("code", "")},
            )
        return response


class APILogoutView(APIView):
    """
    APIリクエスト用に、ユーザーをログアウトさせてJSONレスポンスを返すビュー。
    認証済みのユーザーのみがアクセスできます。
    セッションとAPIトークンの両方を無効化します。
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        # ユーザーに関連付けられたトークンを安全に削除します。
        try:
            # ユーザーに関連付けられたトークンを取得して削除します。
            Token.objects.get(user=request.user).delete()
        except Token.DoesNotExist:
            # トークンが存在しない場合は何もしません (セッション認証のみでログインしている場合など)。
            pass

        # Djangoのセッションを無効化します
        logout(request)

        return Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])  # 認証されていないユーザーもアクセスできるように変更
@ensure_csrf_cookie
def get_session_info(request):
    """
    現在のセッション情報を返し、CSRFクッキーを保証するビュー。
    認証状態に関わらず、常に200 OKを返す。
    """
    is_authenticated = request.user.is_authenticated
    if is_authenticated:
        is_expired = getattr(request.user, "is_password_expired", False)
        return JsonResponse(
            {
                "isAuthenticated": True,
                "isStaff": request.user.is_staff,
                "isSuperuser": request.user.is_superuser,
                "username": request.user.username,
                "isPasswordExpired": is_expired,
            }
        )
    else:
        return JsonResponse({"isAuthenticated": False, "isStaff": False, "isSuperuser": False})


class UserSettingsDetailView(APIView):
    """
    API endpoint for retrieving and updating the authenticated user's profile.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """
        Return the current user's profile data.
        """
        user = request.user
        # Use the AdminUserSerializer to include fields like is_staff
        serializer = AdminUserSerializer(user)
        return Response(serializer.data)

    def patch(self, request, *args, **kwargs):
        """
        Update the current user's profile.
        """
        user = request.user
        before = snapshot(user)
        serializer = UserProfileUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        changes = diff(before, snapshot(user))
        if changes:
            log_event(AccessLog.EventType.PROFILE_UPDATED, request, detail={"changes": changes})
        return Response(AdminUserSerializer(user).data)


class UserPasswordChangeView(APIView):
    """
    API endpoint for changing the user's password.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password1"])
        user.save()
        # 他の端末に残っているJWTセッションも失効させる
        revoke_refresh_tokens(user)
        # To keep the user logged in after password change
        update_session_auth_hash(request, user)
        log_event(AccessLog.EventType.PASSWORD_CHANGED, request, detail={"target": user.get_username()})
        return Response({"message": "パスワードが正常に変更されました。"}, status=status.HTTP_200_OK)


class APITokenView(APIView):
    """
    API endpoint for retrieving and regenerating the user's API token.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        token, _ = Token.objects.get_or_create(user=request.user)
        return Response({"api_token": token.key})

    def post(self, request, *args, **kwargs):
        token, _ = Token.objects.get_or_create(user=request.user)
        token.delete()
        new_token = Token.objects.create(user=request.user)
        log_event(AccessLog.EventType.API_TOKEN_REGENERATED, request, detail={"target": request.user.get_username()})
        return Response({"message": "APIトークンが再生成されました。", "api_token": new_token.key})


class IsStaffOrSuperuser(permissions.BasePermission):
    """
    Allows access only to staff or superusers.
    """

    def has_permission(self, request, view):
        return request.user and (request.user.is_staff or request.user.is_superuser)


class CanModifyTargetUser(permissions.BasePermission):
    """
    スーパーユーザーのアカウントの変更・削除・APIトークンの参照は、スーパーユーザーのみに許可する。
    スタッフがスーパーユーザーのパスワードやトークンを取得してなりすます権限昇格を防ぐ。
    """

    message = "スーパーユーザーのアカウントを操作できるのはスーパーユーザーのみです。"

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or not obj.is_superuser:
            return True
        return request.method in permissions.SAFE_METHODS and view.action != "token"


class UserViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    Accessible only by staff members.
    """

    queryset = CustomUser.objects.all().order_by("-date_joined")
    serializer_class = AdminUserSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrSuperuser, CanModifyTargetUser]

    # 変更前後の値を監査ログに残す。パスワードは値を残さず「変更したかどうか」だけを記録する
    def perform_create(self, serializer):
        user = serializer.save()
        log_event(
            AccessLog.EventType.USER_CREATED,
            self.request,
            detail={"target": user.get_username(), "values": snapshot(user)},
        )

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        user = serializer.save()
        password_changed = bool(serializer.validated_data.get("password"))
        changes = diff(before, snapshot(user))
        if changes or password_changed:
            log_event(
                AccessLog.EventType.USER_UPDATED,
                self.request,
                detail={"target": user.get_username(), "changes": changes, "password_changed": password_changed},
            )

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("自分自身のアカウントは削除できません。")
        values = snapshot(instance)
        instance.delete()
        log_event(
            AccessLog.EventType.USER_DELETED,
            self.request,
            detail={"target": values["custom_id"], "values": values},
        )

    @action(detail=True, methods=["get", "post", "patch"], url_path="token")
    def token(self, request, pk=None):
        """
        管理者が対象ユーザーのAPIトークンとアクセス制御ポリシーを発行・確認・更新するエンドポイント。
        GET: トークン(なければ発行)とポリシーを返す。
        POST: トークンを再発行する。
        PATCH: アクセス制御ポリシー(有効フラグ/許可IP/スコープ)を更新する。
        """
        target_user = self.get_object()
        token, _created = Token.objects.get_or_create(user=target_user)
        policy, _created = ApiTokenPolicy.objects.get_or_create(user=target_user)

        if request.method == "POST":
            token.delete()
            token = Token.objects.create(user=target_user)
            log_event(AccessLog.EventType.API_TOKEN_REGENERATED, request, detail={"target": target_user.get_username()})
        elif request.method == "PATCH":
            policy_fields = ("is_active", "allowed_ips", "scopes")
            before = snapshot(policy, policy_fields)
            serializer = ApiTokenPolicySerializer(policy, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            policy = serializer.save()
            changes = diff(before, snapshot(policy, policy_fields))
            if changes:
                log_event(
                    AccessLog.EventType.API_TOKEN_POLICY_UPDATED,
                    request,
                    detail={"target": target_user.get_username(), "changes": changes},
                )

        return Response(
            {
                "api_token": token.key,
                "policy": ApiTokenPolicySerializer(policy).data,
            }
        )
