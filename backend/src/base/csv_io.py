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


# 表計算ソフトが数式として実行する先頭の文字(CSV/数式インジェクション対策)
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
FORMULA_ESCAPE = "'"


def escape_formula(text: str) -> str:
    """数式として解釈される文字で始まる文字列の先頭に ' を付け、Excel 等で開いたときに実行されないようにする。"""
    return FORMULA_ESCAPE + text if text.startswith(FORMULA_PREFIXES) else text


def unescape_formula(text: str) -> str:
    """escape_formula で付けた先頭の ' を外す(書き出したCSVを取り込み直したときに値が変わらないように)。"""
    if text.startswith(FORMULA_ESCAPE) and text[1:].startswith(FORMULA_PREFIXES):
        return text[1:]
    return text


def format_export_value(value) -> str:
    """
    モデルの値をCSV用の文字列にする。取り込み側(tasks._convert_value)で解釈できる書式にする。
    文字列は数式として実行されないよう escape_formula する(数値は負数を壊さないよう対象外)。
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return escape_formula(value)
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
