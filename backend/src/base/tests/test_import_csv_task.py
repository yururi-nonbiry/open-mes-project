import os
import tempfile
import uuid

from django.test import TestCase

from base.models import AsyncTask, CsvColumnMapping
from base.tasks import import_csv_task
from master.models import Item


class ImportCsvTaskTests(TestCase):
    """BASE-IMPORTTASK-* : CSVインポートタスク本体 (base.tasks.import_csv_task)。"""

    def setUp(self):
        CsvColumnMapping.objects.all().delete()  # マイグレーション投入の既定マッピングを除外
        CsvColumnMapping.objects.create(
            data_type="item", csv_header="code", model_field_name="code", order=1, is_update_key=True
        )
        CsvColumnMapping.objects.create(data_type="item", csv_header="name", model_field_name="name", order=2)
        CsvColumnMapping.objects.create(
            data_type="item", csv_header="type", model_field_name="item_type", order=3
        )

    def _run(self, content, data_type="item"):
        fd, path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        task_id = str(uuid.uuid4())
        AsyncTask.objects.create(task_id=task_id, task_name="test", status="PENDING")
        import_csv_task.apply(args=(data_type, path), task_id=task_id)
        return AsyncTask.objects.get(task_id=task_id)

    def test_base_importtask_01_db_error_row_skipped_others_imported(self):
        """1行でDBエラー(桁あふれ)が起きても、他の行は取り込まれエラー行のみ報告され、進捗も更新される。"""
        too_long_name = "X" * 300  # Item.name は max_length=255
        task = self._run(f"code,name,type\nA-1,Alpha,material\nA-2,{too_long_name},material\nA-3,Gamma,material\n")
        self.assertEqual(task.status, "FAILURE")
        self.assertEqual(task.result["created"], 2)
        self.assertEqual(len(task.result["errors"]), 1)
        self.assertIn("行 3", task.result["errors"][0])
        self.assertEqual(set(Item.objects.filter(code__startswith="A-").values_list("code", flat=True)), {"A-1", "A-3"})
        self.assertEqual(task.progress, 3)

    def test_base_importtask_02_protected_fields_rejected(self):
        CsvColumnMapping.objects.create(
            data_type="sales_order", csv_header="no", model_field_name="order_number", order=1, is_update_key=True
        )
        CsvColumnMapping.objects.create(
            data_type="sales_order", csv_header="shipped", model_field_name="shipped_quantity", order=2
        )
        task = self._run("no,shipped\nSO-1,5\n", data_type="sales_order")
        self.assertEqual(task.status, "FAILURE")
        self.assertIn("shipped_quantity", task.result["error"])

    def test_base_importtask_03_revoked_task_stops(self):
        fd, path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write("code,name,type\nA-1,Alpha,material\n")
        task_id = str(uuid.uuid4())
        AsyncTask.objects.create(task_id=task_id, task_name="test", status="REVOKED")
        import_csv_task.apply(args=("item", path), task_id=task_id)
        self.assertFalse(Item.objects.filter(code="A-1").exists())
        self.assertEqual(AsyncTask.objects.get(task_id=task_id).status, "REVOKED")
        self.assertFalse(os.path.exists(path))


class ImportCsvPurposeTests(TestCase):
    """BASE-IMPORTTASK-1x : 用途コード列のCSV取込(発注・受注・生産計画)。"""

    _run = ImportCsvTaskTests._run

    def setUp(self):
        CsvColumnMapping.objects.all().delete()  # マイグレーション投入の既定マッピングを除外
        from master.models import StockPurpose

        StockPurpose.objects.create(code="PRD-A", name="A製品用")
        StockPurpose.objects.create(code="OLD", name="旧用途", is_active=False)
        CsvColumnMapping.objects.create(
            data_type="purchase_order", csv_header="no", model_field_name="order_number", order=1, is_update_key=True
        )
        CsvColumnMapping.objects.create(
            data_type="purchase_order", csv_header="purpose", model_field_name="purpose", order=2
        )
        CsvColumnMapping.objects.create(
            data_type="sales_order", csv_header="no", model_field_name="order_number", order=1, is_update_key=True
        )
        CsvColumnMapping.objects.create(
            data_type="sales_order", csv_header="purpose", model_field_name="purpose", order=2
        )

    def test_base_importtask_10_purchase_order_purpose_imported(self):
        from inventory.models import PurchaseOrder

        task = self._run("no,purpose\nPO-1,PRD-A\nPO-2,\n", data_type="purchase_order")
        self.assertEqual(task.status, "SUCCESS", task.result)
        self.assertEqual(PurchaseOrder.objects.get(order_number="PO-1").purpose, "PRD-A")
        self.assertIsNone(PurchaseOrder.objects.get(order_number="PO-2").purpose)

    def test_base_importtask_11_unknown_or_inactive_purpose_row_rejected(self):
        from inventory.models import PurchaseOrder

        task = self._run("no,purpose\nPO-1,NOPE\nPO-2,OLD\nPO-3,PRD-A\n", data_type="purchase_order")
        self.assertEqual(task.status, "FAILURE")
        self.assertEqual(len(task.result["errors"]), 2)
        self.assertEqual(list(PurchaseOrder.objects.values_list("order_number", flat=True)), ["PO-3"])

    def test_base_importtask_12_reserved_sales_order_purpose_locked(self):
        from inventory.models import SalesOrder
        from master.models import StockPurpose

        StockPurpose.objects.create(code="PRD-B", name="B製品用")
        SalesOrder.objects.create(order_number="SO-1", quantity=5, reserved_quantity=2, purpose="PRD-A")
        SalesOrder.objects.create(order_number="SO-2", quantity=5, purpose="PRD-A")
        task = self._run("no,purpose\nSO-1,PRD-B\nSO-2,PRD-B\n", data_type="sales_order")
        self.assertEqual(len(task.result["errors"]), 1)
        self.assertEqual(SalesOrder.objects.get(order_number="SO-1").purpose, "PRD-A")
        self.assertEqual(SalesOrder.objects.get(order_number="SO-2").purpose, "PRD-B")
