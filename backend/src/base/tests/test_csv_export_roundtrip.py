import csv
import io
import os
import re
import tempfile
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from base.csv_io import decode_csv_bytes
from base.models import AsyncTask, CsvColumnMapping
from base.tasks import import_csv_task
from master.models import Item, UnitCost
from production.models import ProductionPlan


def excel_save(csv_bytes, *, encoding="cp932", transform=None, trailing_blank_rows=2):
    """
    ExcelでCSVを開き、編集して「CSV(コンマ区切り)」で保存し直した状態を再現する。
    Excelは(1)Windows日本語環境ではCP932で保存し (2)改行をCRLFにし (3)必要なセルだけ引用符で囲み
    (4)表の末尾に空のカンマだけの行が残ることがあり (5)日時や数値を表示形式で書き直す。
    transform(row)->row で任意のセル編集・書式変換を行う。
    """
    text = csv_bytes.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text, newline="")))
    header, body = rows[0], rows[1:]
    if transform:
        body = [transform(dict(zip(header, r))) for r in body]
        body = [[r.get(h, "") for h in header] for r in body]
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(header)
    writer.writerows(body)
    for _ in range(trailing_blank_rows):
        out.write("," * (len(header) - 1) + "\r\n")
    return out.getvalue().encode(encoding)


def excel_datetime(value):
    """2025-01-05 09:00:00 -> 2025/1/5 9:00 (Excelの既定の日時表示。秒は落ちる)。"""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):\d{2}", value)
    return f"{m[1]}/{int(m[2])}/{int(m[3])} {int(m[4])}:{m[5]}" if m else value


class CsvExportImportRoundTripTests(TestCase):
    """BASE-CSVEXPORT-* : 既存データのCSV書き出しと、Excel編集後の取り込み(部分修正)。"""

    def setUp(self):
        CsvColumnMapping.objects.all().delete()
        Item.objects.all().delete()  # マイグレーション投入のデータを除外
        for order, (header, field, key) in enumerate(
            [("品番", "code", True), ("品名", "name", False), ("品目タイプ", "item_type", False),
             ("説明", "description", False), ("リードタイム(日)", "lead_time_days", False)],
            start=1,
        ):
            CsvColumnMapping.objects.create(
                data_type="item", csv_header=header, model_field_name=field, order=order, is_update_key=key
            )
        Item.objects.create(code="A-1", name="ボルト", item_type="material", description="M8, 長さ=20", lead_time_days=3)
        Item.objects.create(code="A-2", name="ナット\"特\"", item_type="material", description="1行目\n2行目", lead_time_days=10)
        Item.objects.create(code="A-3", name="筐体", item_type="product", lead_time_days=0)
        user = get_user_model().objects.create_user(custom_id="u1", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(user=user)

    def _export(self, data_type="item"):
        res = self.client.get(reverse("base_api:csv-mapping-csv-export"), {"data_type": data_type})
        self.assertEqual(res.status_code, 200)
        return res.content

    def _import(self, content, data_type="item"):
        fd, path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        task_id = str(uuid.uuid4())
        AsyncTask.objects.create(task_id=task_id, task_name="test", status="PENDING")
        import_csv_task.apply(args=(data_type, path), task_id=task_id)
        return AsyncTask.objects.get(task_id=task_id)

    def _snapshot(self):
        return {i.code: (i.name, i.item_type, i.description, i.lead_time_days) for i in Item.objects.all()}

    def test_base_csvexport_01_export_contains_existing_data_with_bom(self):
        content = self._export()
        self.assertTrue(content.startswith(b"\xef\xbb\xbf"))
        rows = list(csv.reader(io.StringIO(content.decode("utf-8-sig"), newline="")))
        self.assertEqual(rows[0], ["品番", "品名", "品目タイプ", "説明", "リードタイム(日)"])
        self.assertEqual({r[0] for r in rows[1:]}, {"A-1", "A-2", "A-3"})

    def test_base_csvexport_02_unedited_roundtrip_through_excel_changes_nothing(self):
        before = self._snapshot()
        task = self._import(excel_save(self._export()))
        self.assertEqual(task.status, "SUCCESS", task.result)
        self.assertEqual(task.result["created"], 0)
        self.assertEqual(task.result["updated"], 3)  # 末尾の空行は件数に含まれない
        self.assertEqual(self._snapshot(), before)

    def test_base_csvexport_03_excel_edit_in_utf8_bom_also_works(self):
        def edit(row):
            if row["品番"] == "A-1":
                row["品名"] = "六角ボルト"
            return row
        task = self._import(excel_save(self._export(), encoding="utf-8-sig", transform=edit))
        self.assertEqual(task.status, "SUCCESS", task.result)
        self.assertEqual(Item.objects.get(code="A-1").name, "六角ボルト")

    def test_base_csvexport_04_partial_edit_only_changes_edited_cells(self):
        before = self._snapshot()

        def edit(row):
            if row["品番"] == "A-2":
                row["品名"] = "ナット(改)"
                row["リードタイム(日)"] = "7"
            return row
        task = self._import(excel_save(self._export(), transform=edit))
        self.assertEqual(task.status, "SUCCESS", task.result)
        after = self._snapshot()
        self.assertEqual(after["A-2"], ("ナット(改)", "material", "1行目\n2行目", 7))  # セル内改行も保持
        self.assertEqual(after["A-1"], before["A-1"])
        self.assertEqual(after["A-3"], before["A-3"])

    def test_base_csvexport_05_subset_rows_and_columns_leave_the_rest_untouched(self):
        before = self._snapshot()
        # 変更したい1行・2列(品番+リードタイム)だけを残したCSV。他の行・列は触らない。
        content = "品番,リードタイム(日)\r\nA-3,14\r\n".encode("cp932")
        task = self._import(content)
        self.assertEqual(task.status, "SUCCESS", task.result)
        after = self._snapshot()
        self.assertEqual(after["A-3"][3], 14)
        self.assertEqual(after["A-3"][:3], before["A-3"][:3])
        self.assertEqual(after["A-1"], before["A-1"])
        self.assertEqual(after["A-2"], before["A-2"])

    def test_base_csvexport_06_new_row_added_in_excel_is_created(self):
        raw = excel_save(self._export(), trailing_blank_rows=0).decode("cp932")
        raw += "A-9,新製品,product,,5\r\n"
        task = self._import(raw.encode("cp932"))
        self.assertEqual(task.status, "SUCCESS", task.result)
        self.assertEqual(task.result["created"], 1)
        self.assertEqual(Item.objects.get(code="A-9").lead_time_days, 5)

    def test_base_csvexport_07_excel_number_formats_accepted(self):
        for value, expected in [("1,000", 1000), ("1.00E+03", 1000), ("５", 5), ("7.0", 7)]:
            task = self._import(f"品番,リードタイム(日)\r\nA-1,\"{value}\"\r\n".encode("cp932"))
            self.assertEqual(task.status, "SUCCESS", (value, task.result))
            self.assertEqual(Item.objects.get(code="A-1").lead_time_days, expected, value)

    def test_base_csvexport_08_non_integer_for_integer_field_reported(self):
        task = self._import("品番,リードタイム(日)\r\nA-1,2.5\r\nA-2,abc\r\n".encode("cp932"))
        self.assertEqual(task.status, "FAILURE")
        self.assertEqual(len(task.result["errors"]), 2)
        self.assertEqual(Item.objects.get(code="A-1").lead_time_days, 3)

    def test_base_csvexport_09_error_line_numbers_match_the_spreadsheet_rows(self):
        content = "品番,リードタイム(日)\r\nA-1,5\r\n,,\r\n\r\nA-2,abc\r\n".encode("cp932")
        task = self._import(content)
        self.assertEqual(task.status, "FAILURE")
        self.assertEqual(len(task.result["errors"]), 1)
        self.assertIn("行 5", task.result["errors"][0])  # Excelの5行目(空行を挟んでも同じ番号)

    def test_base_csvexport_10_wrong_header_is_rejected_clearly(self):
        task = self._import("code,name\r\nA-1,x\r\n".encode("cp932"))
        self.assertEqual(task.status, "FAILURE")
        self.assertIn("ヘッダー", task.result["error"])

    def test_base_csvexport_11_header_with_stray_spaces_still_matches(self):
        task = self._import(" 品番 ,品名\r\nA-1,新名称\r\n".encode("cp932"))
        self.assertEqual(task.status, "SUCCESS", task.result)
        self.assertEqual(Item.objects.get(code="A-1").name, "新名称")

    def test_base_csvexport_12_decimal_and_datetime_roundtrip_through_excel(self):
        CsvColumnMapping.objects.create(data_type="unit_cost", csv_header="品番", model_field_name="item_id", order=1, is_update_key=True)
        CsvColumnMapping.objects.create(data_type="unit_cost", csv_header="標準単価", model_field_name="cost", order=2)
        UnitCost.objects.create(item=Item.objects.get(code="A-1"), cost=Decimal("1234.50"))
        for order, (h, f, k) in enumerate(
            [("計画名", "plan_name", True), ("製品品番", "product_id", False), ("計画数量", "planned_quantity", False),
             ("計画開始日時", "planned_start_datetime", False), ("計画終了日時", "planned_end_datetime", False)], start=1):
            CsvColumnMapping.objects.create(data_type="production_plan", csv_header=h, model_field_name=f, order=order, is_update_key=k)
        from django.utils import timezone
        start = timezone.make_aware(timezone.datetime(2025, 1, 5, 9, 0))
        plan = ProductionPlan.objects.create(
            plan_name="P1", product=Item.objects.get(code="A-3"), planned_quantity=10,
            planned_start_datetime=start, planned_end_datetime=start + timezone.timedelta(hours=8),
        )
        # 単価は桁区切り表示に、日時はExcel既定の「2025/1/5 9:00」に変わって保存される
        task = self._import(excel_save(self._export("unit_cost"), transform=lambda r: {**r, "標準単価": f"{Decimal(r['標準単価']):,}"}), "unit_cost")
        self.assertEqual(task.status, "SUCCESS", task.result)
        self.assertEqual(UnitCost.objects.get().cost, Decimal("1234.50"))

        def edit(row):
            row = {k: excel_datetime(v) for k, v in row.items()}
            row["計画数量"] = "20"
            return row
        task = self._import(excel_save(self._export("production_plan"), transform=edit), "production_plan")
        self.assertEqual(task.status, "SUCCESS", task.result)
        plan.refresh_from_db()
        self.assertEqual(plan.planned_quantity, 20)
        self.assertEqual(plan.planned_start_datetime, start)
        self.assertEqual(plan.planned_end_datetime, start + timezone.timedelta(hours=8))

    def test_base_csvexport_13_unknown_encoding_reports_error(self):
        with self.assertRaises(ValueError):
            decode_csv_bytes("あ".encode("utf-16") + b"\x81")

    def test_base_csvexport_14_validation(self):
        url = reverse("base_api:csv-mapping-csv-export")
        self.assertEqual(self.client.get(url).status_code, 400)
        self.assertEqual(self.client.get(url, {"data_type": "nope"}).status_code, 400)
        self.assertEqual(self.client.get(url, {"data_type": "supplier"}).status_code, 400)  # マッピング無し
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(url, {"data_type": "item"}).status_code, 401)


class CsvFormulaInjectionTests(TestCase):
    """BASE-CSVINJ-* : 書き出したCSVを表計算ソフトで開いても数式として実行されず、取り込み直しても値が変わらない。"""

    def test_base_csvinj_01_escape_and_unescape(self):
        from base.csv_io import escape_formula, format_export_value, unescape_formula

        for text in ("=HYPERLINK(\"http://x\")", "+1", "-cmd", "@SUM(A1)"):
            escaped = format_export_value(text)
            self.assertTrue(escaped.startswith("'"), text)
            self.assertEqual(unescape_formula(escaped), text)
        # 数値の負数・普通の文字列はそのまま
        self.assertEqual(format_export_value(-5), "-5")
        self.assertEqual(format_export_value("ABC"), "ABC")
        self.assertEqual(escape_formula("'quoted"), "'quoted")
        self.assertEqual(unescape_formula("'quoted"), "'quoted")
