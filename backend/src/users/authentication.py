import ipaddress

from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


def get_client_ip(request):
    """nginxが付与する X-Forwarded-For の先頭値、なければ REMOTE_ADDR をクライアントIPとして扱う。"""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _ip_allowed(client_ip, allowed_ips_text):
    if not allowed_ips_text.strip():
        return True
    if not client_ip:
        return False
    try:
        client = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for entry in allowed_ips_text.replace(",", "\n").splitlines():
        entry = entry.strip()
        if not entry:
            continue
        try:
            if client in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


class ScopedTokenAuthentication(TokenAuthentication):
    """
    QRリーダー等のデバイスや外部連携アプリ向けの固定トークン認証。
    標準のTokenAuthenticationに加えて、ユーザーにApiTokenPolicyが設定されている場合、
    トークンの有効フラグ・接続元IP許可リスト・アクセス可能なAPIアプリ(スコープ)を検証する。
    ポリシーが未設定のユーザーは従来通り無制限にアクセスできる（後方互換性のため）。
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result
        policy = getattr(user, "api_token_policy", None)
        if policy is None:
            return user, token

        if not policy.is_active:
            raise AuthenticationFailed("このAPIトークンは無効化されています。")

        if not _ip_allowed(get_client_ip(request), policy.allowed_ips):
            raise AuthenticationFailed("許可されていない接続元IPアドレスです。")

        if policy.scopes:
            app_name = request.resolver_match.app_name if request.resolver_match else None
            if app_name not in policy.scopes:
                raise AuthenticationFailed("このAPIトークンには、このAPIへのアクセス権限がありません。")

        return user, token
