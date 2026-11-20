"""マスターCSVの入出力で共通に使う処理(文字コード判定・書き出し値の整形)。"""

import csv
import io
from datetime import date, datetime

from django.utils import timezone

# Excelの「CSV(コンマ区切り)」はWindows日本語環境ではShift_JIS(CP932)で保存される。
# 「CSV UTF-8」で保存した場合はBOM付きUTF-8になる。
_FALLBACK_ENCODINGS = ("cp932",)


def decode_csv_bytes(data: bytes) -> str:
    """BOM付き/無しUTF-8を優先し、読めなければExcel標準のCP932として解釈する。"""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    for encoding in _FALLBACK_ENCODINGS:
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("文字コードを判定できません。UTF-8 または Shift_JIS(Excelの標準CSV)で保存してください。")


def format_export_value(value) -> str:
    """モデルの値をCSV用の文字列にする。取り込み側(tasks._convert_value)で解釈できる書式にする。"""
    if value is None:
        return ""
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return str(value)


def build_export_csv(rows, headers) -> bytes:
    """ヘッダーと行(値のリスト)からBOM付きUTF-8のCSVバイト列を作る(Excelでの文字化け防止)。"""
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")
