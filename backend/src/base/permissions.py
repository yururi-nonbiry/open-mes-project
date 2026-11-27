from rest_framework import permissions


def _is_admin(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


class IsAuthenticatedCreateAdminChange(permissions.BasePermission):
    """
    マスター系の権限。参照と新規登録は認証済みユーザー、既存データの更新・削除は管理者(スタッフ)のみ。
    現場での登録は妨げず、他の業務データから参照されるマスターを一般ユーザーが書き換え・削除できないようにする。
    """

    message = "既存のマスターの変更・削除は管理者のみ行えます。"

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS or request.method == "POST":
            return True
        return _is_admin(request.user)


class IsAuthenticatedDeleteAdmin(permissions.BasePermission):
    """削除だけを管理者(スタッフ)に限る(検査実績など、品質の記録として残すデータ向け)。"""

    message = "削除は管理者のみ行えます。"

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method == "DELETE":
            return _is_admin(request.user)
        return True
