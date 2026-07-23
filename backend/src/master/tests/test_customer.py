from django.urls import reverse
from rest_framework import status

from ..models import Customer
from .test_helpers import MasterAPITestBase


class CustomerCrudTests(MasterAPITestBase):
    """MST-CUST-* : CustomerViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:customer-list")
        self.customer = self.create_customer()

    def _detail_url(self, customer_id):
        return reverse("master_api:customer-detail", args=[customer_id])

    def test_mst_cust_01_create_success(self):
        payload = {"code": "CUST-NEW", "name": "新顧客"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Customer.objects.filter(code="CUST-NEW").exists())

    def test_mst_cust_02_duplicate_code_rejected(self):
        payload = {"code": self.customer.code, "name": "別名"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_cust_03_update_code_is_read_only(self):
        response = self.client.patch(self._detail_url(self.customer.id), {"code": "CHANGED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertNotEqual(self.customer.code, "CHANGED")

    def test_mst_cust_04_delete_success(self):
        response = self.client.delete(self._detail_url(self.customer.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Customer.objects.filter(id=self.customer.id).exists())
