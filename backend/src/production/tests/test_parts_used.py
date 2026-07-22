from django.urls import reverse
from rest_framework import status

from .test_helpers import ProductionAPITestBase


class PartsUsedCrudTests(ProductionAPITestBase):
    """PU-CRUD-* : 使用部品CRUD (PartsUsedViewSet)。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("production_api:parts-used-list")
        self.part_used = self.create_parts_used(production_plan="BOM-1", part_code=self.material_item1.code)

    def test_pu_crud_01_list(self):
        self.create_parts_used(production_plan="BOM-2", part_code=self.material_item2.code)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)

    def test_pu_crud_02_search_production_plan(self):
        self.create_parts_used(production_plan="BOM-2", part_code=self.material_item2.code)
        response = self.client.get(self.list_url, {"production_plan": "BOM-1"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_pu_crud_03_search_part_code(self):
        self.create_parts_used(production_plan="BOM-2", part_code=self.material_item2.code)
        response = self.client.get(self.list_url, {"part_code": self.material_item2.code})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_pu_crud_04_create(self):
        payload = {
            "production_plan": "BOM-3",
            "part_code": self.material_item2.code,
            "warehouse": self.warehouse_a.warehouse_number,
            "quantity_used": 3,
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
