"""稼働日カレンダーに基づく日付計算。"""
from datetime import date, datetime, timedelta

from django.utils import timezone

from .models import WorkCalendarDay, WorkCalendarSetting

# 稼働日が1日も無い設定(全曜日が休みで特別稼働日も無い)での無限ループを避ける探索上限
_MAX_SEARCH_DAYS = 3660


class WorkCalendar:
    """曜日パターンと例外日を一度だけ読み込み、稼働日判定・稼働日さかのぼりを行う。"""

    def __init__(self):
        self.weekday_flags = WorkCalendarSetting.load().weekday_flags()
        self.exceptions = dict(WorkCalendarDay.objects.values_list("date", "is_workday"))

    def is_workday(self, d: date) -> bool:
        if d in self.exceptions:
            return self.exceptions[d]
        return self.weekday_flags[d.weekday()]

    def has_workday(self) -> bool:
        return any(self.weekday_flags) or any(self.exceptions.values())

    def subtract_workdays(self, value, days: int):
        """
        value(date または datetime)から稼働日で days 日さかのぼる。時刻は保持する。
        days<=0 は value のまま。稼働日が全く無い設定のときは暦日でさかのぼる。
        """
        if days <= 0:
            return value
        if not self.has_workday():
            return value - timedelta(days=days)
        current = value
        remaining = days
        for _ in range(_MAX_SEARCH_DAYS):
            current = current - timedelta(days=1)
            if self.is_workday(_to_date(current)):
                remaining -= 1
                if remaining == 0:
                    return current
        return value - timedelta(days=days)


def _to_date(value) -> date:
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.date()
    return value


def subtract_workdays(value, days: int):
    return WorkCalendar().subtract_workdays(value, days)
