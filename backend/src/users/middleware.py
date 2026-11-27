# users/middleware.py

from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication

from users.models import CustomUser


_UNRESOLVED = object()


def _authenticate_api(request):
    """APIの認証方式(JWT、QRリーダー等の固定トークン)でユーザーを解決する。認証できなければ None。"""
    from users.authentication import ScopedTokenAuthentication  # 循環importを避けるため遅延import

    drf_request = Request(request)
    for authenticator in (JWTAuthentication(), ScopedTokenAuthentication()):
        try:
            result = authenticator.authenticate(drf_request)
        except Exception:  # 不正・期限切れのトークンは認証失敗として扱う(DRF側で401を返す)
            return None
        if result:
            return result[0]
    return None


def _resolve_user(request):
    """
    リクエストのユーザーを返す。セッション認証で未確定の場合は、APIの認証方式(JWT・固定トークン)から解決する。
    DRFの認証はビューの実行時に行われ、このミドルウェア(process_view)の時点では request.user がセッション認証の結果のままのため、
    JWT・固定トークンで認証したユーザーは匿名扱いになり、パスワードの有効期限切れを検出できなかった。
    1リクエストで何度も検証しないよう、結果をリクエストに保持する。
    """
    cached = getattr(request, "_password_expiration_user", _UNRESOLVED)
    if cached is not _UNRESOLVED:
        return cached
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        user = _authenticate_api(request)
    request._password_expiration_user = user
    return user


class PasswordExpirationMiddleware(MiddlewareMixin):
    def _should_check_password_expiration(self, request):
        """
        Determines if password expiration check should be performed for the current request.
        """
        if _resolve_user(request) is None:
            return False

        # request.resolver_matchはURL解決後に利用可能 (process_view内)
        if not hasattr(request, "resolver_match") or not request.resolver_match:
            return True  # 判定できないため、デフォルトでチェック対象とする

        # 特定のビューを完全修飾されたビュー名 (namespace:url_name) で除外する。
        # この方法はパスやURL名のみをチェックするより堅牢です。
        exempt_view_names = {
            # 認証とパスワード管理用のAPIエンドポイント
            "users_api:api_login",
            "users_api:api_logout",
            "users_api:api_user_password_change",
            "users_api:api_session_info",  # フロントエンドが常にセッション状態を確認できるように除外
            # 期限切れのユーザーがパスワード変更画面(自分の設定)を開き、トークンを更新・失効できるようにする
            "users_api:api_user_settings",
            "users_api:token_refresh",
            "users_api:token_blacklist",
        }

        if request.resolver_match.view_name in exempt_view_names:
            return False

        return True

    def process_view(self, request, view_func, view_args, view_kwargs):
        if not self._should_check_password_expiration(request):
            return None

        user = _resolve_user(request)
        # システム連携用のアカウント(QRリーダー・外部連携)は人がパスワードを変える運用ではないため対象外
        if getattr(user, "account_type", None) == CustomUser.AccountType.SYSTEM:
            return None
        if hasattr(user, "is_password_expired") and user.is_password_expired:
            # パスワードの有効期限が切れています。除外されていないリクエストに対してJSONレスポンスを返します。
            # これにより、リダイレクトの責務をフロントエンドクライアントに委任します。
            return JsonResponse(
                {
                    "error": "パスワードの有効期限が切れています。新しいパスワードを設定してください。",
                    "code": "password_expired",
                },
                status=403,
            )  # 403 Forbidden はこの場合に適切です。
        return None
