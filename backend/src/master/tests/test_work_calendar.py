from datetime import date, datetime

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from ..calendar import WorkCalendar
from ..models import WorkCalendarDay, WorkCalendarSetting
from .test_helpers import MasterAPITestBase


class WorkCalendarLogicTests(MasterAPITestBase):
    """MST-WC-L-* : 稼働日さかのぼり計算。2026-11-09 は月曜。"""

    def test_default_pattern_skips_weekend(self):
        # 月曜(11/9)の1稼働日前は金曜(11/6)
        self.assertEqual(WorkCalendar().subtract_workdays(date(2026, 11, 9), 1), date(2026, 11, 6))
        # 月曜の3稼働日前は水曜(11/4)
        self.assertEqual(WorkCalendar().subtract_workdays(date(2026, 11, 9), 3), date(2026, 11, 4))

    def test_zero_days_unchanged(self):
        self.assertEqual(WorkCalendar().subtract_workdays(date(2026, 11, 8), 0), date(2026, 11, 8))

    def test_holiday_exception_skipped(self):
        WorkCalendarDay.objects.create(date=date(2026, 11, 6), is_workday=False)  # 金曜を休業
        self.assertEqual(WorkCalendar().subtract_workdays(date(2026, 11, 9), 1), date(2026, 11, 5))

    def test_special_workday_counted(self):
        WorkCalendarDay.objects.create(date=date(2026, 11, 8), is_workday=True)  # 日曜を稼働
        self.assertEqual(WorkCalendar().subtract_workdays(date(2026, 11, 9), 1), date(2026, 11, 8))

    def test_keeps_time_of_day(self):
        dt = timezone.make_aware(datetime(2026, 11, 9, 10, 30))
        result = WorkCalendar().subtract_workdays(dt, 1)
        self.assertEqual(timezone.localtime(result).date(), date(2026, 11, 6))
        self.assertEqual(timezone.localtime(result).hour, 10)

    def test_no_workday_falls_back_to_calendar_days(self):
        setting = WorkCalendarSetting.load()
        for f in WorkCalendarSetting.WEEKDAY_FIELDS:
            setattr(setting, f, False)
        setting.save()
        self.assertEqual(WorkCalendar().subtract_workdays(date(2026, 11, 9), 2), date(2026, 11, 7))


class WorkCalendarApiTests(MasterAPITestBase):
    """MST-WC-A-* : カレンダーAPI。"""

    def test_settings_get_and_update(self):
        url = reverse("master_api:work-calendar-settings")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["data"]["monday"])
        self.assertFalse(res.data["data"]["saturday"])
        res = self.client.put(url, {"saturday": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(WorkCalendarSetting.load().saturday)

    def test_day_crud_and_duplicate(self):
        url = reverse("master_api:work-calendar-day-list")
        res = self.client.post(url, {"date": "2026-12-29", "is_workday": False, "note": "年末休業"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        res = self.client.post(url, {"date": "2026-12-29", "is_workday": False}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.client.get(url, {"year": 2026, "month": 12})
        self.assertEqual(len(res.data["data"]), 1)
        day = WorkCalendarDay.objects.get()
        res = self.client.delete(reverse("master_api:work-calendar-day-detail", args=[day.pk]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
