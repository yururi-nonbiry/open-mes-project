from django.urls import reverse
from rest_framework import status

from ..models import Item
from .test_helpers import MasterAPITestBase


class ItemCrudTests(MasterAPITestBase):
    """MST-ITEM-* : ItemViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:item-list")
        self.item = self.create_item(item_type="product", provision_type="paid")

    def _detail_url(self, item_id):
        return reverse("master_api:item-detail", args=[item_id])

    def test_mst_item_01_list_returns_display_names(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")
        row = response.data["data"][0]
        self.assertEqual(row["item_type"], "Product")
        self.assertEqual(row["provision_type"], "有償支給")

    def test_mst_item_02_create_success(self):
        payload = {"name": "新品目", "code": "ITEM-NEW", "item_type": "material"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Item.objects.filter(code="ITEM-NEW").exists())

    def test_mst_item_03_duplicate_code_rejected(self):
        payload = {"name": "別名", "code": self.item.code, "item_type": "material"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_mst_item_04_duplicate_name_rejected(self):
        payload = {"name": self.item.name, "code": "ITEM-OTHER", "item_type": "material"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_mst_item_05_update_code_is_read_only(self):
        response = self.client.patch(self._detail_url(self.item.id), {"code": "CHANGED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertNotEqual(self.item.code, "CHANGED")

    def test_mst_item_06_update_name(self):
        response = self.client.patch(self._detail_url(self.item.id), {"name": "更新後の名前"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertEqual(self.item.name, "更新後の名前")

    def test_mst_item_07_delete_success(self):
        response = self.client.delete(self._detail_url(self.item.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Item.objects.filter(id=self.item.id).exists())

    def test_mst_item_08_delete_protected_by_unit_cost(self):
        self.create_unit_cost(item=self.item)
        response = self.client.delete(self._detail_url(self.item.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], "error")
        self.assertTrue(Item.objects.filter(id=self.item.id).exists())

    def test_mst_item_09_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
