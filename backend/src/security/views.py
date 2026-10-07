import csv
import json
from datetime import datetime, time

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from base.pagination import StandardResultsSetPagination
from base.responses import error_response

from . import lockout, login_captcha
from .audit import log_event
from .models import AccessLog, AccountLock, IpBlock
from .serializers import AccessLogSerializer, AccountLockSerializer, IpBlockSerializer

EXPORT_MAX_ROWS = 100_000
EXPORT_HEADERS = [
    "日時",
    "イベント",
    "ユーザーID",
    "IPアドレス",
    "メソッド",
    "パス",
    "ステータス",
    "ユーザーエージェント",
    "詳細",
]


def _parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def filter_access_logs(params):
    """
    アクセスログの絞り込み。一覧とCSV出力で共通。
    event_type(カンマ区切りで複数可) / username(部分一致) / ip_address(前方一致) / date_from / date_to(YYYY-MM-DD)
    """
    queryset = AccessLog.objects.all()
    event_types = [value for value in params.get("event_type", "").split(",") if value]
    if event_types:
        queryset = queryset.filter(event_type__in=event_types)
    username = params.get("username", "").strip()
    if username:
        queryset = queryset.filter(Q(username__icontains=username) | Q(user__username__icontains=username))
    ip_address = params.get("ip_address", "").strip()
    if ip_address:
        queryset = queryset.filter(ip_address__startswith=ip_address)
    tz = timezone.get_current_timezone()
    date_from = _parse_date(params.get("date_from"))
    if date_from:
        queryset = queryset.filter(created_at__gte=datetime.combine(date_from, time.min, tzinfo=tz))
    date_to = _parse_date(params.get("date_to"))
    if date_to:
        queryset = queryset.filter(created_at__lte=datetime.combine(date_to, time.max, tzinfo=tz))
    return queryset.order_by("-created_at", "-id")


class AccessLogPagination(StandardResultsSetPagination):
    page_size = 50


class AccessLogListView(generics.ListAPIView):
    """アクセスログの一覧(管理者のみ)。"""

    serializer_class = AccessLogSerializer
    permission_classes = [permissions.IsAdminUser]
    pagination_class = AccessLogPagination

    def get_queryset(self):
        return filter_access_logs(self.request.query_params).select_related("user")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["event_types"] = [
            {"value": value, "label": label} for value, label in AccessLog.EventType.choices
        ]
        return response


class _Echo:
    def write(self, value):
        return value


class AccessLogExportView(APIView):
    """絞り込んだアクセスログをCSV(BOM付きUTF-8)で出力する(管理者のみ)。出力したこと自体も記録する。"""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request, *args, **kwargs):
        queryset = filter_access_logs(request.query_params)[:EXPORT_MAX_ROWS]
        log_event(
            AccessLog.EventType.ACCESS_LOG_EXPORTED,
            request,
            detail={key: value for key, value in request.query_params.items() if value},
        )
        labels = dict(AccessLog.EventType.choices)
        tz = timezone.get_current_timezone()
        writer = csv.writer(_Echo())

        def rows():
            # BOMを付けてExcelでの文字化けを防ぐ
            yield "\ufeff" + writer.writerow(EXPORT_HEADERS)
            for log in queryset.iterator(chunk_size=2000):
                yield writer.writerow(
                    [
                        timezone.localtime(log.created_at, tz).strftime("%Y-%m-%d %H:%M:%S"),
                        labels.get(log.event_type, log.event_type),
                        log.username,
                        log.ip_address or "",
                        log.method,
                        log.path,
                        log.status_code or "",
                        log.user_agent,
                        _json_text(log.detail),
                    ]
                )

        filename = f"access_logs_{timezone.localtime():%Y%m%d_%H%M%S}.csv"
        response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


def _json_text(value):
    return json.dumps(value, ensure_ascii=False) if value else ""


class LockStatusView(APIView):
    """ロック中・失敗回数のあるアカウントと、ブロック中のIPの一覧(管理者のみ)。"""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request, *args, **kwargs):
        now = timezone.now()
        locks = AccountLock.objects.select_related("user").order_by("-updated_at")
        blocks = IpBlock.objects.filter(blocked_until__gt=now).order_by("-updated_at")
        context = {"now": now}
        return Response(
            {
                "users": AccountLockSerializer(locks, many=True, context=context).data,
                "ips": IpBlockSerializer(blocks, many=True).data,
            }
        )


class UnlockUserView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, user_id, *args, **kwargs):
        user = get_object_or_404(get_user_model(), pk=user_id)
        if not lockout.unlock_user(user, request=request, actor=request.user):
            return error_response("このユーザーはロックされていません。", status.HTTP_404_NOT_FOUND)
        return Response({"message": f"ユーザー {user.get_username()} のロックを解除しました。"})


class UnblockIpView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk, *args, **kwargs):
        block = get_object_or_404(IpBlock, pk=pk)
        if not lockout.unblock_ip(block, request=request, actor=request.user):
            return error_response("このIPアドレスはブロックされていません。", status.HTTP_404_NOT_FOUND)
        return Response({"message": f"IPアドレス {block.ip_address} のブロックを解除しました。"})


class CaptchaView(APIView):
    """ログイン画面用のCAPTCHAを発行する。未ログインで呼ぶため認証は行わない。"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return Response(login_captcha.generate())
