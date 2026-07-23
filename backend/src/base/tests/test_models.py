from django.db import IntegrityError, transaction
from django.test import TestCase

from ..models import AsyncTask, BaseSetting


class BaseSettingModelTests(TestCase):
    """BASE-SETTING-* : BaseSettingモデル。API/シリアライザ未実装のため、モデル単体でのみテスト可能。"""

    def test_base_setting_01_str_returns_name(self):
        setting = BaseSetting.objects.create(name="site_name", value="生産ナビ")
        self.assertEqual(str(setting), "site_name")

    def test_base_setting_02_duplicate_name_rejected(self):
        BaseSetting.objects.create(name="site_name", value="生産ナビ")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                BaseSetting.objects.create(name="site_name", value="別の値")


class AsyncTaskModelTests(TestCase):
    """BASE-ASYNCTASK-* : AsyncTaskモデル。API/シリアライザ未実装のため、モデル単体でのみテスト可能。"""

    def test_base_asynctask_01_str_format(self):
        task = AsyncTask.objects.create(task_id="task-abc", task_name="CSV Import: item", status="PENDING")
        self.assertIn("CSV Import: item", str(task))
        self.assertIn("task-abc", str(task))

    def test_base_asynctask_02_duplicate_task_id_rejected(self):
        AsyncTask.objects.create(task_id="task-abc", task_name="A")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AsyncTask.objects.create(task_id="task-abc", task_name="B")
