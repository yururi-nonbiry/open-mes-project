from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class AppInfoHealthCheckTests(APITestCase):
    """BASE-INFO-* : AppInfoView / HealthCheckView。認証不要のpublicエンドポイント。"""

    def test_base_info_01_app_info_anonymous_allowed(self):
        with override_settings(VERSION="1.2.3"):
            response = self.client.get(reverse("base_api:app-info"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["version"], "1.2.3")

    def test_base_info_02_health_check_anonymous_allowed(self):
        response = self.client.get(reverse("base_api:health-check"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
