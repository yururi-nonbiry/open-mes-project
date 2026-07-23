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

    def test_base_modelfields_03_valid_business_choice_missing_from_local_mapping_returns_400(self):
        """
        既知の不具合: "customer"はmodels.DATA_TYPE_CHOICESの正式な選択肢だが、
        api.py内のローカルDATA_TYPE_MODEL_MAPPINGには含まれておらず、400になる。
        """
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(self.url, {"data_type": "customer"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_modelfields_04_anonymous_rejected(self):
        response = self.client.get(self.url, {"data_type": "item"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_modelfields_05_non_admin_authenticated_rejected(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, {"data_type": "item"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
