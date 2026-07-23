from django.urls import reverse
from rest_framework import status

from ..models import ModelDisplaySetting
from .test_helpers import BaseAPITestBase


class ModelDisplaySettingCrudTests(BaseAPITestBase):
    """BASE-MDS-* : ModelDisplaySettingViewSet CRUD、verbose_nameの解決ロジック。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("base_api:model-display-setting-list")
        self.setting = self.create_model_display_setting()

    def _detail_url(self, setting_id):
        return reverse("base_api:model-display-setting-detail", args=[setting_id])

    def test_base_mds_01_list_returns_plain_array(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_base_mds_02_create_resolves_verbose_name_from_real_model_field(self):
        payload = {"data_type": "item", "model_field_name": "name"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["verbose_name"], "name")

    def test_base_mds_03_duplicate_data_type_and_field_rejected(self):
        payload = {"data_type": self.setting.data_type, "model_field_name": self.setting.model_field_name}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_mds_04_verbose_name_fallback_goods_receipt_remaining_quantity(self):
        payload = {"data_type": "goods_receipt", "model_field_name": "remaining_quantity"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["verbose_name"], "残数量")

    def test_base_mds_05_verbose_name_fallback_inventory_available_quantity(self):
        payload = {"data_type": "inventory", "model_field_name": "available_quantity"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["verbose_name"], "利用可能数")

    def test_base_mds_06_delete_returns_204(self):
        response = self.client.delete(self._detail_url(self.setting.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ModelDisplaySetting.objects.filter(id=self.setting.id).exists())

    def test_base_mds_07_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_mds_08_non_admin_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ModelDisplaySettingBulkSaveTests(BaseAPITestBase):
    """BASE-MDSBULK-* : model-display-settings bulk-save action。管理者限定。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:model-display-setting-bulk-save")
        self.existing = self.create_model_display_setting()

    def test_base_mdsbulk_01_replaces_existing_settings(self):
        payload = [{"model_field_name": "name", "display_order": 1}]
        response = self.client.post(f"{self.url}?data_type=item", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ModelDisplaySetting.objects.filter(id=self.existing.id).exists())
        self.assertTrue(ModelDisplaySetting.objects.filter(data_type="item", model_field_name="name").exists())

    def test_base_mdsbulk_02_non_admin_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(f"{self.url}?data_type=item", [], format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
