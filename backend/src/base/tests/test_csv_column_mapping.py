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
        mock_task.delay.return_value = MagicMock(id="fake-task-id-1")
        self.client.force_authenticate(user=self.user)
        csv_file = SimpleUploadedFile("data.csv", b"code,name\nITEM-1,Test\n", content_type="text/csv")
        response = self.client.post(f"{self.url}?data_type=item", {"csv_file": csv_file}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["task_id"], "fake-task-id-1")
        self.assertTrue(AsyncTask.objects.filter(task_id="fake-task-id-1").exists())

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
