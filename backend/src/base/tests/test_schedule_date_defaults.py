from django.urls import reverse
from rest_framework import status

from ..models import BaseSetting
from .test_helpers import BaseAPITestBase

FROM = "schedule_date_from_offset_days"
TO = "schedule_date_to_offset_days"


class ScheduleDateDefaultsTests(BaseAPITestBase):
    """BASE-SCHDATE-* : 入庫・出庫の期間フィルタ初期値(ScheduleDateDefaultsView)。"""

    def setUp(self):
        super().setUp()
        self.url = reverse("base_api:schedule-date-defaults")

    def test_base_schdate_01_default_is_none(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {FROM: None, TO: None})

    def test_base_schdate_02_update_and_get(self):
        response = self.client.put(self.url, {FROM: -7, TO: 14}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.url).data, {FROM: -7, TO: 14})

    def test_base_schdate_03_null_clears(self):
        self.client.put(self.url, {FROM: 0, TO: 3}, format="json")
        response = self.client.put(self.url, {FROM: None}, format="json")
        self.assertEqual(response.data, {FROM: None, TO: 3})

    def test_base_schdate_04_invalid_rejected(self):
        for bad in ("abc", 1.5, True, 99999):
            response = self.client.put(self.url, {FROM: bad}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertFalse(BaseSetting.objects.filter(name=FROM).exists())

    def test_base_schdate_05_from_after_to_rejected(self):
        response = self.client.put(self.url, {FROM: 5, TO: 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_base_schdate_06_non_admin_can_read_not_write(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)
        response = self.client.put(self.url, {FROM: 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_base_schdate_07_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)
