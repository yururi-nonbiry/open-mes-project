from django.urls import reverse
from rest_framework import status

from .. import feature_settings
from ..models import BaseSetting
from .test_helpers import BaseAPITestBase


class TerminologyTests(BaseAPITestBase):
    """BASE-TERM-* : 「部品」の呼び方の設定(TerminologyView)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:terminology")

    def test_base_term_01_default_is_buhin(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"part": "部品"})

    def test_base_term_02_update_and_get(self):
        response = self.client.put(self.url, {"part": " 材料 "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.url).data, {"part": "材料"})

    def test_base_term_03_invalid_rejected(self):
        for bad in ("", "   ", "あ" * 11, 5, None):
            response = self.client.put(self.url, {"part": bad}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertEqual(self.client.put(self.url, {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BaseSetting.objects.filter(name=feature_settings.PART_TERM).exists())

    def test_base_term_04_non_admin_can_read_not_write(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)
        response = self.client.put(self.url, {"part": "材料"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_base_term_05_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_term_06_apply_part_term_replaces_message(self):
        text = "部品の引当があります。"
        self.assertEqual(feature_settings.apply_part_term(text), text)
        feature_settings.set_part_term("材料")
        self.assertEqual(feature_settings.apply_part_term(text), "材料の引当があります。")
        self.assertEqual(str(feature_settings.lazy_part_term("部品・中間品")), "材料・中間品")
