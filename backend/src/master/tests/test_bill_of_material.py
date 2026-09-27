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


class MultiLevelBillOfMaterialTests(MasterAPITestBase):
    """MST-BOMML-* : 中間品を含む多階層BOM(循環参照の防止・全階層の展開)。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("master_api:bill-of-material-list")
        self.explode_url = reverse("master_api:bill-of-material-explode")
        # 製品A = 中間品S × 2 + 材料X × 1、中間品S = 材料X × 3 + 材料Y × 0.5
        self.product = self.create_item(code="PROD-A", item_type="product", name="製品A")
        self.sub = self.create_item(code="SUB-S", item_type="intermediate", name="中間品S")
        self.mat_x = self.create_item(code="MAT-X", item_type="material", name="材料X", unit="個")
        self.mat_y = self.create_item(code="MAT-Y", item_type="material", name="材料Y", unit="kg")
        self.create_bill_of_material(product=self.product, material=self.sub, quantity="2.000")
        self.create_bill_of_material(product=self.product, material=self.mat_x, quantity="1.000")
        self.create_bill_of_material(product=self.sub, material=self.mat_x, quantity="3.000")
        self.create_bill_of_material(product=self.sub, material=self.mat_y, quantity="0.500")

    def test_mst_bomml_01_intermediate_can_be_parent_and_child(self):
        other = self.create_item(code="SUB-T", item_type="intermediate", name="中間品T")
        response = self.client.post(
            self.list_url, {"product": other.code, "material": self.sub.code, "quantity": "1"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_mst_bomml_02_self_reference_rejected(self):
        response = self.client.post(
            self.list_url, {"product": self.sub.code, "material": self.sub.code, "quantity": "1"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("循環参照", response.data["error"])

    def test_mst_bomml_03_indirect_cycle_rejected(self):
        """中間品T → 中間品S の構成がある状態で、中間品S の部品に中間品T を追加すると循環する。"""
        other = self.create_item(code="SUB-T", item_type="intermediate", name="中間品T")
        self.create_bill_of_material(product=other, material=self.sub, quantity="1.000")
        response = self.client.post(
            self.list_url, {"product": self.sub.code, "material": other.code, "quantity": "1"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BillOfMaterial.objects.filter(product=self.sub, material=other).exists())

    def test_mst_bomml_04_update_into_cycle_rejected(self):
        bom = BillOfMaterial.objects.get(product=self.sub, material=self.mat_y)
        other = self.create_item(code="SUB-T", item_type="intermediate", name="中間品T")
        self.create_bill_of_material(product=other, material=self.sub, quantity="1.000")
        response = self.client.patch(
            reverse("master_api:bill-of-material-detail", args=[bom.id]), {"material": other.code}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mst_bomml_05_explode_tree_and_leaf_totals(self):
        response = self.client.get(self.explode_url, {"product": self.product.code, "quantity": "10"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["data"]
        tree = {node["item_code"]: node for node in data["tree"]}
        self.assertEqual(tree["SUB-S"]["required_quantity"], "20.000")
        self.assertEqual(tree["SUB-S"]["level"], 1)
        children = {node["item_code"]: node for node in tree["SUB-S"]["children"]}
        self.assertEqual(children["MAT-X"]["required_quantity"], "60.000")
        self.assertEqual(children["MAT-Y"]["required_quantity"], "10.000")
        self.assertEqual(children["MAT-X"]["level"], 2)
        # 最下位の品目の合計: 材料X = 10×1 + 10×2×3 = 70、材料Y = 10×2×0.5 = 10(中間品は合計に含めない)
        totals = {t["item_code"]: t["required_quantity"] for t in data["totals"]}
        self.assertEqual(totals, {"MAT-X": "70.000", "MAT-Y": "10.000"})

    def test_mst_bomml_06_explode_requires_existing_product(self):
        self.assertEqual(self.client.get(self.explode_url).status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(self.explode_url, {"product": "NO-SUCH"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mst_bomml_07_explode_invalid_quantity(self):
        response = self.client.get(self.explode_url, {"product": self.product.code, "quantity": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.get(self.explode_url, {"product": self.product.code, "quantity": "0"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
