from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from ..models import WorkProgress
from .test_helpers import ProductionAPITestBase


class WorkProgressCrudTests(ProductionAPITestBase):
    """WP-CRUD-* : 作業進捗CRUD (WorkProgressViewSet)。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan()
        self.list_url = reverse("production_api:work-progress-list")
        self.wp = self.create_work_progress(production_plan=self.plan, process_step="Assembly")

    def _detail_url(self, wp_id):
        return reverse("production_api:work-progress-detail", args=[wp_id])

    def test_wp_crud_01_list(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_wp_crud_02_search_production_plan_id(self):
        other_plan = self.create_plan(plan_name="Other Plan")
        self.create_work_progress(production_plan=other_plan, process_step="Painting")
        response = self.client.get(self.list_url, {"production_plan_id": str(self.plan.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_wp_crud_03_search_operator_id(self):
        self.wp.operator = self.user
        self.wp.save()
        response = self.client.get(self.list_url, {"operator_id": self.user.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_wp_crud_04_duplicate_plan_process_step_rejected(self):
        payload = {"production_plan": str(self.plan.id), "process_step": "Assembly"}
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wp_crud_05_start_after_end_rejected(self):
        now = timezone.now()
        payload = {
            "production_plan": str(self.plan.id),
            "process_step": "Painting",
            "start_datetime": now.isoformat(),
            "end_datetime": (now - timezone.timedelta(hours=1)).isoformat(),
        }
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wp_crud_06_status_and_quantity_read_only(self):
        response = self.client.patch(
            self._detail_url(self.wp.id), {"status": "COMPLETED", "quantity_completed": 99}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.wp.refresh_from_db()
        self.assertEqual(self.wp.status, "NOT_STARTED")
        self.assertEqual(self.wp.quantity_completed, 0)


class OverallProgressProtectionTests(ProductionAPITestBase):
    """WP-OVERALL-* : 全体進捗の行は進捗更新だけが管理し、直接の作成・変更・削除で完成品在庫の計上を壊させない。"""

    def setUp(self):
        super().setUp()
        self.plan = self.create_plan(status="IN_PROGRESS")
        self.progress_url = reverse("production_api:production-plan-update-progress", args=[self.plan.id])
        response = self.client.post(self.progress_url, {"status": "COMPLETED", "good_quantity": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.overall = WorkProgress.objects.get(production_plan=self.plan, process_step="Overall Plan Progress")
        self.detail_url = reverse("production_api:work-progress-detail", args=[self.overall.id])

    def test_wp_overall_01_cannot_delete(self):
        self.assertEqual(self.client.delete(self.detail_url).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(WorkProgress.objects.filter(pk=self.overall.pk).exists())

    def test_wp_overall_02_cannot_rename(self):
        response = self.client.patch(self.detail_url, {"process_step": "組立"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(self.detail_url, {"remarks": "memo"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_wp_overall_03_cannot_create_overall_directly(self):
        other = self.create_plan(plan_name="Other")
        response = self.client.post(
            reverse("production_api:work-progress-list"),
            {"production_plan": str(other.id), "process_step": "Overall Plan Progress"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wp_overall_04_other_steps_can_be_deleted(self):
        step = self.create_work_progress(production_plan=self.plan, process_step="組立")
        response = self.client.delete(reverse("production_api:work-progress-detail", args=[step.id]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
