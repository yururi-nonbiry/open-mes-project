from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class ModelFieldsViewTests(APITestCase):
    """BASE-MODELFIELDS-* : ModelFieldsView。IsAdminUser限定。"""

    def setUp(self):
        self.url = reverse("base_api:model-fields")
        self.user = User.objects.create_user(custom_id="testuser", password="testpassword", username="testuser")
        self.admin_user = User.objects.create_user(
            custom_id="adminuser", password="testpassword", username="adminuser", is_staff=True
        )

    def test_base_modelfields_01_valid_data_type_returns_field_list(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.url, {"data_type": "item"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        field_names = [f["name"] for f in response.data]
        self.assertIn("code", field_names)

    def test_base_modelfields_02_missing_data_type_returns_400(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_modelfields_03_customer_work_center_unit_cost_are_valid_data_types(self):
        """顧客・ワークセンター・標準単価もモデル項目表示設定・CSVマッピングの対象として項目一覧を取得できる。"""
        self.client.force_authenticate(user=self.admin_user)
        for data_type in ("customer", "work_center", "unit_cost"):
            response = self.client.get(self.url, {"data_type": data_type})
            self.assertEqual(response.status_code, status.HTTP_200_OK, data_type)

    def test_base_modelfields_06_relations_offered_by_code_column_by_default(self):
        """既定(CSVマッピング用)では外部キーを参照先コードの <フィールド名>_id で返す。別名・実フィールド名では返さない。"""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.url, {"data_type": "purchase_order"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        field_names = [f["name"] for f in response.data]
        self.assertIn("order_number", field_names)
        for name in ("supplier", "supplier_rel", "part_number", "warehouse"):
            self.assertNotIn(name, field_names)
        self.assertIn("part_number_rel_id", field_names)

    def test_base_modelfields_09_seeded_fk_mappings_are_offered(self):
        """初期投入のマッピング(標準単価の item_id・生産計画の product_id)が項目一覧にあり、保存で消えない。"""
        self.client.force_authenticate(user=self.admin_user)
        names = [f["name"] for f in self.client.get(self.url, {"data_type": "unit_cost"}).data]
        self.assertIn("item_id", names)
        names = [f["name"] for f in self.client.get(self.url, {"data_type": "production_plan"}).data]
        self.assertIn("product_id", names)
        # 業務処理と連動する外部キー(統合先・親計画)と、別名で出す用途は <名前>_id では出さない
        for name in ("merged_into_id", "parent_plan_id", "purpose_rel_id"):
            self.assertNotIn(name, names)
        self.assertIn("purpose", names)

    def test_base_modelfields_07_include_relations_returns_foreign_keys_by_alias(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.url, {"data_type": "purchase_order", "include_relations": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        verbose_names = {f["name"]: f["verbose_name"] for f in response.data}
        self.assertEqual(verbose_names["supplier"], "仕入先")
        self.assertEqual(verbose_names["part_number"], "品番")
        self.assertEqual(verbose_names["warehouse"], "入庫倉庫")
        self.assertNotIn("supplier_rel", verbose_names)

        # 別名を持たない外部キー(入庫実績の作業者・入庫予定)は含めない
        response = self.client.get(self.url, {"data_type": "goods_receipt", "include_relations": "true"})
        field_names = [f["name"] for f in response.data]
        self.assertIn("warehouse", field_names)
        self.assertNotIn("operator", field_names)
        self.assertNotIn("purchase_order", field_names)

    def test_base_modelfields_04_anonymous_rejected(self):
        response = self.client.get(self.url, {"data_type": "item"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_modelfields_05_non_admin_authenticated_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, {"data_type": "item"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_base_modelfields_08_purpose_offered_for_csv_mapping(self):
        """発注・受注・生産計画では、CSVマッピング用に用途コード(別名 purpose)を返す。品番等の外部キーは返さない。"""
        self.client.force_authenticate(user=self.admin_user)
        for data_type in ("purchase_order", "sales_order", "production_plan"):
            response = self.client.get(self.url, {"data_type": data_type})
            names = [f["name"] for f in response.data]
            self.assertIn("purpose", names, data_type)
            self.assertNotIn("purpose_rel", names, data_type)
            self.assertNotIn("part_number", names, data_type)
        names = [f["name"] for f in self.client.get(self.url, {"data_type": "item"}).data]
        self.assertNotIn("purpose", names)
