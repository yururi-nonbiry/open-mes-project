from django.urls import reverse
from rest_framework import status

from ..models import Machine
from .test_helpers import MachineAPITestBase


class MachineCrudTests(MachineAPITestBase):
    """MCH-* : MachineViewSet CRUD。"""

    def setUp(self):
        super().setUp()
        self.list_url = reverse("machine_api:machine-list")
        self.machine = self.create_machine()

    def _detail_url(self, machine_id):
        return reverse("machine_api:machine-detail", kwargs={"pk": machine_id})

    def test_mch_01_list_includes_created_at(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(r for r in response.data["data"] if r["machine_number"] == self.machine.machine_number)
        self.assertIn("created_at", row)

    def test_mch_02_create_success(self):
        payload = {"machine_number": "MCH-NEW", "name": "新規設備", "location": "1F"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Machine.objects.filter(machine_number="MCH-NEW").exists())

    def test_mch_03_duplicate_machine_number_rejected_with_custom_message(self):
        payload = {"machine_number": self.machine.machine_number, "name": "別名"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("この設備番号は既に使用されています。", str(response.data))

    def test_mch_04_retrieve_excludes_created_at(self):
        response = self.client.get(self._detail_url(self.machine.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("created_at", response.data["data"])

    def test_mch_05_update_name(self):
        response = self.client.patch(self._detail_url(self.machine.id), {"name": "更新後の設備名"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.name, "更新後の設備名")

    def test_mch_06_update_machine_number_is_writable(self):
        response = self.client.patch(
            self._detail_url(self.machine.id), {"machine_number": "MCH-CHANGED"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.machine_number, "MCH-CHANGED")

    def test_mch_07_delete_success(self):
        response = self.client.delete(self._detail_url(self.machine.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Machine.objects.filter(id=self.machine.id).exists())

    def test_mch_08_anonymous_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
