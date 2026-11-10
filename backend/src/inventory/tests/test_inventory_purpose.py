from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework import status

from inventory import services
from inventory.models import Inventory
from master.models import StockPurpose

from .test_helpers import InventoryAPITestBase


class InventoryPurposeTests(InventoryAPITestBase):
    """INV-PUR-* : 在庫の用途(同一品番・倉庫・棚でも用途別に別行で持てる)。"""

    def setUp(self):
        super().setUp()
        self.purpose_a = StockPurpose.objects.create(code="PRD-A", name="A製品用")
        self.purpose_b = StockPurpose.objects.create(code="PRD-B", name="B製品用")

    def test_inv_pur_01_same_location_different_purposes_coexist(self):
        self.create_inventory(quantity=5)  # 汎用
        self.create_inventory(quantity=5, purpose="PRD-A")
        self.create_inventory(quantity=5, purpose="PRD-B")
        self.assertEqual(Inventory.objects.count(), 3)

    def test_inv_pur_02_duplicate_same_purpose_rejected(self):
        self.create_inventory(purpose="PRD-A")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_inventory(purpose="PRD-A")

    def test_inv_pur_03_duplicate_generic_rejected(self):
        self.create_inventory()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_inventory()

    def test_inv_pur_04_get_or_create_distinguishes_purpose(self):
        generic = services.get_or_create_locked_inventory(self.item1.code, "WH-A", "A-01")
        purposed = services.get_or_create_locked_inventory(self.item1.code, "WH-A", "A-01", purpose="PRD-A")
        again = services.get_or_create_locked_inventory(self.item1.code, "WH-A", "A-01", purpose="PRD-A")
        self.assertNotEqual(generic.pk, purposed.pk)
        self.assertEqual(purposed.pk, again.pk)
        self.assertIsNone(generic.purpose)

    def test_inv_pur_05_api_exposes_purpose(self):
        self.create_inventory(quantity=3, purpose="PRD-A")
        response = self.client.get(reverse("inventory_api:inventory-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["purpose"], "PRD-A")
