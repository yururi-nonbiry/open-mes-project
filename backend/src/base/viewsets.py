from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response

from .responses import error_response


class CustomSuccessMessageMixin:
    """
    マスター系 ViewSet 共通の応答形式。
    一覧/詳細は {"data": ...}、登録/更新は {"message": ..., "data": ...}、削除は {"message": ...} を返す。
    関連データがあり削除できない場合は統一形式のエラー(400)を返す。
    """

    # 削除(または更新による子レコード削除)が ProtectedError で拒否されたときの文言。{model_name} は置換される。
    protected_error_message = "この{model_name}は他で使用されているため削除できません。関連データを確認してください。"

    def _model_name(self):
        return self.queryset.model._meta.verbose_name

    def _protected_error_response(self):
        return error_response(self.protected_error_message.format(model_name=self._model_name()))

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response({"data": serializer.data})

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {"message": f"{self._model_name()}を登録しました。", "data": serializer.data},
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)  # Default to PATCH
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            # 検査項目の測定詳細のように、更新で子レコードを削除するシリアライザがあるため
            self.perform_update(serializer)
        except ProtectedError:
            return self._protected_error_response()
        return Response({"message": f"{self._model_name()}を更新しました。", "data": serializer.data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance_repr = str(instance)
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return self._protected_error_response()
        return Response({"message": f"{self._model_name()}「{instance_repr}」を削除しました。"})
