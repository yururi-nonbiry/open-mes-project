"""
API応答形式の共通定義。

成否は HTTP ステータスコードで判定する(本文に success / status のフラグは持たせない)。
エラー時(4xx/5xx)の本文は常に次の形式とする:

    {
        "error": "画面にそのまま表示できるメッセージ",
        "errors": {"field": ["..."], ...},  # 入力値エラー時のみ。フィールド別の詳細
        "code": "..."                       # 認証系など、クライアントが分岐に使う識別子がある場合のみ
    }
"""

import logging

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler, set_rollback

logger = logging.getLogger(__name__)

VALIDATION_ERROR_MESSAGE = "入力内容に誤りがあります。"
INTERNAL_ERROR_MESSAGE = (
    "サーバー内部でエラーが発生しました。時間をおいて再度お試しいただくか、管理者に連絡してください。"
)


def error_response(message, status_code=status.HTTP_400_BAD_REQUEST, *, errors=None, code=None):
    """統一形式のエラー応答を返す。"""
    body = {"error": str(message)}
    if errors:
        body["errors"] = errors
    if code:
        body["code"] = code
    return Response(body, status=status_code)


def _first_message(detail):
    """ValidationError の detail(ネストした dict / list)から最初のメッセージを取り出す。"""
    if isinstance(detail, dict):
        values = detail.values()
    elif isinstance(detail, list):
        values = detail
    else:
        return str(detail) if detail else None
    for value in values:
        message = _first_message(value)
        if message:
            return message
    return None


def validation_error_body(detail):
    errors = detail if isinstance(detail, dict) else {api_settings.NON_FIELD_ERRORS_KEY: detail}
    non_field = errors.get(api_settings.NON_FIELD_ERRORS_KEY)
    if non_field:
        message = _first_message(non_field)
    else:
        # フォームを持たない画面(モバイル等)でも原因が分かるよう、最初の項目エラーを添える
        field, field_detail = next(iter(errors.items()), (None, None))
        field_message = _first_message(field_detail)
        message = f"{VALIDATION_ERROR_MESSAGE}({field}: {field_message})" if field_message else VALIDATION_ERROR_MESSAGE
    return {"error": message, "errors": errors}


def api_exception_handler(exc, context):
    """
    DRF の EXCEPTION_HANDLER。例外から生成される応答をすべて統一形式に変換する。
    DRF が扱わない想定外の例外も、内部情報を応答に含めずログへ出力したうえで 500 の統一形式で返す。
    """
    response = exception_handler(exc, context)

    if response is None:
        view = context.get("view")
        logger.error("Unhandled exception in %s", view.__class__.__name__ if view else "unknown view", exc_info=exc)
        set_rollback()
        return error_response(INTERNAL_ERROR_MESSAGE, status.HTTP_500_INTERNAL_SERVER_ERROR)

    if isinstance(exc, exceptions.ValidationError):
        response.data = validation_error_body(response.data)
        return response

    data = response.data
    if isinstance(data, dict):
        # simplejwt の InvalidToken などは detail / code / messages を持つ dict を返す
        message = data.get("detail", "")
        code = data.get("code")
    else:
        message, code = data, None
    if code is None:
        codes = exc.get_codes() if isinstance(exc, exceptions.APIException) else None
        code = codes if isinstance(codes, str) else None

    body = {"error": str(message)}
    if code:
        body["code"] = code
    response.data = body
    return response
