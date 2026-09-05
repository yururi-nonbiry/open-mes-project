from django.urls import reverse
from rest_framework import status

from ..models import BillOfMaterial
from .test_helpers import MasterAPITestBase


class BillOfMaterialCrudTests(MasterAPITestBase):
    """MST-BOM-* : BillOfMaterialViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:bill-of-material-list")
        self.product = self.create_item(code="PROD-A", item_type="product", name="製品A")
        self.material = self.create_item(code="MAT-A", item_type="material", name="部品A")
        self.bom = self.create_bill_of_material(product=self.product, material=self.material, quantity="3.000")

    def _detail_url(self, bom_id):
        return reverse("master_api:bill-of-material-detail", args=[bom_id])

    def test_mst_bom_01_create_success(self):
        other_material = self.create_item(code="MAT-B", item_type="material", name="部品B")
        payload = {"product": self.product.code, "material": other_material.code, "quantity": "1.500"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(BillOfMaterial.objects.filter(product=self.product, material=other_material).exists())

    def test_mst_bom_02_duplicate_product_material_rejected(self):
        payload = {"product": self.product.code, "material": self.material.code, "quantity": "9.000"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_bom_03_product_must_be_product_type(self):
        payload = {"product": self.material.code, "material": self.material.code, "quantity": "1.000"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_bom_04_material_must_be_material_type(self):
        payload = {"product": self.product.code, "material": self.product.code, "quantity": "1.000"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_bom_05_quantity_must_be_positive(self):
        other_material = self.create_item(code="MAT-C", item_type="material", name="部品C")
        payload = {"product": self.product.code, "material": other_material.code, "quantity": "0"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_bom_06_update_quantity(self):
        response = self.client.patch(self._detail_url(self.bom.id), {"quantity": "5.250"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.bom.refresh_from_db()
        self.assertEqual(str(self.bom.quantity), "5.250")

    def test_mst_bom_07_list_shows_related_names(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["data"][0]
        self.assertEqual(row["product"], self.product.code)
        self.assertEqual(row["material"], self.material.code)
        self.assertEqual(row["product_name"], self.product.name)
        self.assertEqual(row["material_name"], self.material.name)
        self.assertEqual(row["material_unit"], self.material.unit)

    def test_mst_bom_08_delete_success(self):
        response = self.client.delete(self._detail_url(self.bom.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(BillOfMaterial.objects.filter(id=self.bom.id).exists())

    def test_mst_bom_09_referenced_material_cannot_be_deleted(self):
        item_url = reverse("master_api:item-detail", args=[self.material.id])
        response = self.client.delete(item_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(BillOfMaterial.objects.filter(id=self.bom.id).exists())
