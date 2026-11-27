from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
        self.assertEqual(response.data, {"part": "部品", "picking": "ピッキング", "issue": "出庫"})

    def test_base_term_02_update_and_get(self):
        response = self.client.put(self.url, {"part": " 材料 "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.url).data["part"], "材料")

    def test_base_term_03_invalid_rejected(self):
        for bad in ("", "   ", "あ" * 11, 5, None):
            response = self.client.put(self.url, {"part": bad}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertEqual(self.client.put(self.url, {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BaseSetting.objects.filter(name=feature_settings.TERMS["part"][0]).exists())

    def test_base_term_03b_update_picking_issue_partial(self):
        response = self.client.put(self.url, {"picking": "払出", "issue": "払出し"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"part": "部品", "picking": "払出", "issue": "払出し"})

    def test_base_term_04_non_admin_can_read_not_write(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)
        response = self.client.put(self.url, {"part": "材料"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_base_term_05_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_base_term_06_apply_terms_replaces_message(self):
        text = "部品の出庫と追加ピッキングと入出庫履歴"
        self.assertEqual(feature_settings.apply_terms(text), text)
        feature_settings.set_term("part", "材料")
        feature_settings.set_term("picking", "払出")
        feature_settings.set_term("issue", "出荷")
        # 「入出庫」は置き換えない
        self.assertEqual(feature_settings.apply_terms(text), "材料の出荷と追加払出と入出庫履歴")
        self.assertEqual(str(feature_settings.lazy_terms("部品・中間品")), "材料・中間品")

    def test_base_term_07_swapped_terms_replaced_in_one_pass(self):
        feature_settings.set_term("picking", "出庫")
        feature_settings.set_term("issue", "ピッキング")
        self.assertEqual(feature_settings.apply_terms("ピッキングと出庫"), "出庫とピッキング")


class WorkflowVisibilityTests(APITestCase):
    """BASE-WFVIS-* : トップ画面の業務フローの表示設定をサーバーに保存し、全ユーザーで共通にする。"""

    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.admin = User.objects.create_user(custom_id="wfadmin", password="pw", username="wfadmin", is_staff=True)
        self.user = User.objects.create_user(custom_id="wfuser", password="pw", username="wfuser")
        self.url = reverse("base_api:workflow-visibility")

    def test_base_wfvis_01_default_visible_and_shared(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.url).data["receipt-flow"], "visible")
        self.assertEqual(self.client.put(self.url, {"receipt-flow": "hidden"}, format="json").status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.put(self.url, {"receipt-flow": "hidden", "production-plan-flow": "grayed"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.put(self.url, {"receipt-flow": "nope"}, format="json").status_code, 400)

        self.client.force_authenticate(self.user)
        data = self.client.get(self.url).data
        self.assertEqual(
            (data["receipt-flow"], data["production-plan-flow"], data["production-issue-flow"]),
            ("hidden", "grayed", "visible"),
        )
