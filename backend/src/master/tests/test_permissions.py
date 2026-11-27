from django.urls import reverse
from rest_framework import status

from .test_helpers import MasterAPITestBase


class MasterPermissionTests(MasterAPITestBase):
    """MST-PERM-* : マスターの参照・新規登録は一般ユーザーも可能、既存の変更・削除は管理者のみ。"""

    def setUp(self):
        super().setUp()
        self.item = self.create_item()
        self.client.force_authenticate(user=self.general_user)

    def test_mst_perm_01_general_user_can_list_and_create(self):
        self.assertEqual(self.client.get(reverse("master_api:item-list")).status_code, status.HTTP_200_OK)
        response = self.client.post(
            reverse("master_api:item-list"), {"code": "ITEM-NEW", "name": "新規", "item_type": "material"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

    def test_mst_perm_02_general_user_cannot_update_or_delete(self):
        url = reverse("master_api:item-detail", args=[self.item.pk])
        self.assertEqual(self.client.patch(url, {"name": "変更"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)
        self.item.refresh_from_db()
        self.assertEqual(self.item.name, "テスト品目")
