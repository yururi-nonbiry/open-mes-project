from django.urls import reverse
from rest_framework import status

from ..feature_settings import PICKING_SEARCH_FIELD_DEFAULTS
from .test_helpers import BaseAPITestBase


class PickingSearchFieldsTests(BaseAPITestBase):
    """BASE-PKSEARCH-* : ピッキング画面の検索対象項目(PickingSearchFieldsView)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:picking-search-fields")

    def test_base_pksearch_01_default_excludes_purpose(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"fields": list(PICKING_SEARCH_FIELD_DEFAULTS)})
        self.assertNotIn("purpose", response.data["fields"])

    def test_base_pksearch_02_update_and_get(self):
        response = self.client.put(self.url, {"fields": ["purpose", "product_code"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.url).data, {"fields": ["product_code", "purpose"]})

    def test_base_pksearch_03_empty_allowed(self):
        self.client.put(self.url, {"fields": []}, format="json")
        self.assertEqual(self.client.get(self.url).data, {"fields": []})

    def test_base_pksearch_04_invalid_rejected(self):
        for bad in ("purpose", ["unknown"], [1], None):
            response = self.client.put(self.url, {"fields": bad}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)

    def test_base_pksearch_05_non_admin_can_read_not_write(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)
        response = self.client.put(self.url, {"fields": ["purpose"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_base_pksearch_06_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)
