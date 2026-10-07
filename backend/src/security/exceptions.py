from rest_framework import status

from base.responses import api_exception_handler

from .audit import log_event
from .models import AccessLog


def audit_exception_handler(exc, context):
    """
    DRF の EXCEPTION_HANDLER。応答の形式は base.responses.api_exception_handler に任せ、
    権限エラー(403)を監査ログに記録する。
    """
    response = api_exception_handler(exc, context)
    if response is not None and response.status_code == status.HTTP_403_FORBIDDEN:
        view = context.get("view")
        data = response.data if isinstance(response.data, dict) else {}
        log_event(
            AccessLog.EventType.PERMISSION_DENIED,
            context.get("request"),
            status_code=response.status_code,
            detail={"view": view.__class__.__name__ if view else "", "error": data.get("error", "")},
        )
    return response
