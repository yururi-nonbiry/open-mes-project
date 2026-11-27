from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from ..models import AsyncTask, CsvColumnMapping
from .test_helpers import BaseAPITestBase


class CsvColumnMappingCrudTests(BaseAPITestBase):
    """BASE-CSVMAP-* : CsvColumnMappingViewSet CRUD。CustomSuccessMessageMixinは使用せず標準DRF形式。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("base_api:csv-mapping-list")
        self.mapping = self.create_csv_column_mapping()

    def _detail_url(self, mapping_id):
        return reverse("base_api:csv-mapping-detail", args=[mapping_id])

    def test_base_csvmap_01_list_returns_plain_array(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        headers = [row["csv_header"] for row in response.data]
        self.assertIn(self.mapping.csv_header, headers)

    def test_base_csvmap_02_create_success(self):
        payload = {"data_type": "item", "csv_header": "品目名", "model_field_name": "name", "order": 2}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(CsvColumnMapping.objects.filter(csv_header="品目名").exists())

    def test_base_csvmap_03_duplicate_header_for_same_data_type_rejected(self):
        payload = {
            "data_type": self.mapping.data_type,
            "csv_header": self.mapping.csv_header,
            "model_field_name": "other_field",
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_csvmap_04_update_success(self):
        response = self.client.patch(self._detail_url(self.mapping.id), {"order": 9}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mapping.refresh_from_db()
        self.assertEqual(self.mapping.order, 9)

    def test_base_csvmap_05_delete_returns_204(self):
        response = self.client.delete(self._detail_url(self.mapping.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CsvColumnMapping.objects.filter(id=self.mapping.id).exists())

    def test_base_csvmap_06_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_csvmap_07_non_admin_rejected_on_list(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class CsvTemplateActionTests(BaseAPITestBase):
    """BASE-CSVTEMPLATE-* : csv-template action。認証済みユーザーなら誰でも利用可（IsAdminUserからの降格）。"""

    def setUp(self):
        super().setUp()
        self.mapping = self.create_csv_column_mapping()
        self.url = reverse("base_api:csv-mapping-csv-template")

    def test_base_csvtemplate_01_non_admin_authenticated_allowed(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, {"data_type": self.mapping.data_type})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8-sig")
        self.assertIn(self.mapping.csv_header.encode("utf-8"), response.content)

    def test_base_csvtemplate_02_missing_data_type_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_csvtemplate_03_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url, {"data_type": self.mapping.data_type})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ImportCsvActionTests(BaseAPITestBase):
    """BASE-IMPORTCSV-* : import-csv action。Celeryタスク送信部分はモックする。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:csv-mapping-import-csv")

    @patch("base.api.import_csv_task")
    def test_base_importcsv_01_non_admin_authenticated_allowed(self, mock_task):
        self.client.force_authenticate(user=self.user)
        csv_file = SimpleUploadedFile("data.csv", b"code,name\nITEM-1,Test\n", content_type="text/csv")
        response = self.client.post(f"{self.url}?data_type=item", {"csv_file": csv_file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        task_id = response.data["task_id"]
        # AsyncTaskはタスク送信前に作成され、同じtask_idでCeleryへ送信される
        self.assertTrue(AsyncTask.objects.filter(task_id=task_id, status="PENDING").exists())
        self.assertEqual(mock_task.apply_async.call_args.kwargs["task_id"], task_id)

    def test_base_importcsv_02_missing_data_type_returns_400(self):
        self.client.force_authenticate(user=self.user)
        csv_file = SimpleUploadedFile("data.csv", b"code,name\n", content_type="text/csv")
        response = self.client.post(self.url, {"csv_file": csv_file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_importcsv_03_missing_csv_file_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(f"{self.url}?data_type=item", {}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TaskStatusActionTests(BaseAPITestBase):
    """BASE-TASKSTATUS-* : csv-import-status / csv-import-cancel。認証済みユーザーなら誰でも利用可。"""

    def setUp(self):
        super().setUp()
        self.task = self.create_async_task()

    def _status_url(self, task_id):
        return reverse("base_api:csv-import-status", args=[task_id])

    def _cancel_url(self, task_id):
        return reverse("base_api:csv-import-cancel", args=[task_id])

    def test_base_taskstatus_01_get_status_success(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self._status_url(self.task.task_id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "PENDING")

    def test_base_taskstatus_02_get_status_not_found(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self._status_url("00000000-0000-0000-0000-000000000000"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("base.api.import_csv_task")
    def test_base_taskstatus_03_cancel_pending_task_success(self, mock_task):
        mock_task.AsyncResult.return_value = MagicMock()
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self._cancel_url(self.task.task_id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, "REVOKED")

    def test_base_taskstatus_04_cancel_already_completed_task_returns_400(self):
        completed_task = self.create_async_task(task_id="22222222-2222-2222-2222-222222222222", status="SUCCESS")
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self._cancel_url(completed_task.task_id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


    def test_base_taskstatus_05_other_users_task_hidden_from_general_user(self):
        """他のユーザーが開始したタスクは、管理者以外には見つからない(進捗の参照・キャンセル不可)。"""
        other = self.create_async_task(task_id="33333333-3333-3333-3333-333333333333", created_by=self.admin_user)
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self._status_url(other.task_id)).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(self._cancel_url(other.task_id)).status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertEqual(other.status, "PENDING")
        self.client.force_authenticate(user=self.admin_user)
        self.assertEqual(self.client.get(self._status_url(other.task_id)).status_code, status.HTTP_200_OK)

    @patch("base.api.import_csv_task")
    def test_base_taskstatus_06_cancel_removes_temp_file(self, mock_task):
        """キャンセルでタスクを強制終了すると後始末が走らないため、一時ファイルはキャンセル時に消す。"""
        import os
        import tempfile

        mock_task.AsyncResult.return_value = MagicMock()
        fd, path = tempfile.mkstemp(suffix=".csv")
        os.close(fd)
        task = self.create_async_task(
            task_id="44444444-4444-4444-4444-444444444444", created_by=self.user, file_path=path
        )
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.post(self._cancel_url(task.task_id)).status_code, status.HTTP_200_OK)
        self.assertFalse(os.path.exists(path))

class CsvColumnMappingBulkSaveTests(BaseAPITestBase):
    """BASE-CSVBULK-* : csv-mappings bulk-save action。管理者限定（降格対象外）。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:csv-mapping-bulk-save")
        self.existing = self.create_csv_column_mapping()

    def test_base_csvbulk_01_replaces_existing_mappings(self):
        payload = [
            {"csv_header": "新ヘッダー", "model_field_name": "name", "order": 1, "is_active": True},
        ]
        response = self.client.post(f"{self.url}?data_type=item", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(CsvColumnMapping.objects.filter(id=self.existing.id).exists())
        self.assertTrue(CsvColumnMapping.objects.filter(csv_header="新ヘッダー").exists())

    def test_base_csvbulk_02_non_admin_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(f"{self.url}?data_type=item", [], format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class CsvAdminOnlyDataTypeTests(BaseAPITestBase):
    """管理者専用の設定データ(基本設定・CSVマッピング等)のCSV書き出し・取り込みは一般ユーザーに許可しない。"""

    ADMIN_ONLY = ("base_setting", "csv_column_mapping", "model_display_setting", "qr_code_action")

    def test_csv_admin_only_01_normal_user_cannot_export_or_import(self):
        self.client.force_authenticate(user=self.user)
        export_url = reverse("base_api:csv-mapping-csv-export")
        import_url = reverse("base_api:csv-mapping-import-csv")
        for data_type in self.ADMIN_ONLY:
            self.assertEqual(self.client.get(export_url, {"data_type": data_type}).status_code, 403, data_type)
            self.assertEqual(self.client.post(import_url + f"?data_type={data_type}").status_code, 403, data_type)

    def test_csv_admin_only_02_normal_user_can_still_export_master_data(self):
        self.create_csv_column_mapping(data_type="item", csv_header="品目コード", model_field_name="code")
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("base_api:csv-mapping-csv-export"), {"data_type": "item"})
        self.assertEqual(response.status_code, 200)

    def test_csv_admin_only_03_admin_can_export_admin_only_data(self):
        self.create_csv_column_mapping(data_type="base_setting", csv_header="項目名", model_field_name="name")
        response = self.client.get(reverse("base_api:csv-mapping-csv-export"), {"data_type": "base_setting"})
        self.assertEqual(response.status_code, 200)
