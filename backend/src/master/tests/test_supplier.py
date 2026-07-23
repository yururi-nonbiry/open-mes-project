from django.urls import reverse
from rest_framework import status

from ..models import Supplier
from .test_helpers import MasterAPITestBase


class SupplierCrudTests(MasterAPITestBase):
    """MST-SUP-* : SupplierViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:supplier-list")
        self.supplier = self.create_supplier(email="existing@example.com")

    def _detail_url(self, supplier_id):
        return reverse("master_api:supplier-detail", args=[supplier_id])

    def test_mst_sup_01_create_success(self):
        payload = {"supplier_number": "SUP-NEW", "name": "新サプライヤー"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Supplier.objects.filter(supplier_number="SUP-NEW").exists())

    def test_mst_sup_02_duplicate_supplier_number_rejected(self):
        payload = {"supplier_number": self.supplier.supplier_number, "name": "別名"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_sup_03_duplicate_name_rejected_via_custom_validation(self):
        payload = {"supplier_number": "SUP-OTHER", "name": self.supplier.name}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_mst_sup_04_duplicate_email_rejected(self):
        payload = {"supplier_number": "SUP-OTHER", "name": "別名2", "email": self.supplier.email}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_mst_sup_05_blank_email_allowed(self):
        payload = {"supplier_number": "SUP-NOEMAIL", "name": "メールなし"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_mst_sup_06_update_supplier_number_is_read_only(self):
        response = self.client.patch(self._detail_url(self.supplier.id), {"supplier_number": "CHANGED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.supplier.refresh_from_db()
        self.assertNotEqual(self.supplier.supplier_number, "CHANGED")

    def test_mst_sup_07_update_own_email_not_rejected_as_duplicate(self):
        response = self.client.patch(self._detail_url(self.supplier.id), {"email": self.supplier.email}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
