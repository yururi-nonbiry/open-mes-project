"""管理者画面から切り替える機能のON/OFF設定(BaseSetting に保存する)。"""

from .models import BaseSetting

# 入庫時、品番にデフォルト入庫棚番が未登録なら、入庫した棚番を登録するか確認する
CONFIRM_REGISTER_DEFAULT_LOCATION = "confirm_register_default_location"

FEATURE_DEFAULTS = {
    CONFIRM_REGISTER_DEFAULT_LOCATION: True,
}


def get_feature_flag(name):
    default = FEATURE_DEFAULTS[name]
    setting = BaseSetting.objects.filter(name=name, is_deleted=False).first()
    if setting is None or not setting.is_active:
        return default
    return setting.value.strip().lower() in ("1", "true", "on")


def set_feature_flag(name, enabled):
    if name not in FEATURE_DEFAULTS:
        raise KeyError(name)
    BaseSetting.objects.update_or_create(
        name=name,
        defaults={"value": "true" if enabled else "false", "is_active": True, "is_deleted": False},
    )


# 入庫予定・出庫予定の期間フィルタの初期値(今日からの相対日数)。空=指定なし。入庫・出庫で共通。
SCHEDULE_DATE_FROM_OFFSET = "schedule_date_from_offset_days"
SCHEDULE_DATE_TO_OFFSET = "schedule_date_to_offset_days"
SCHEDULE_DATE_OFFSET_NAMES = (SCHEDULE_DATE_FROM_OFFSET, SCHEDULE_DATE_TO_OFFSET)
SCHEDULE_DATE_OFFSET_LIMIT = 3660


def get_schedule_date_offset(name):
    """相対日数(int)を返す。未設定・無効・不正値は None(指定なし)。"""
    setting = BaseSetting.objects.filter(name=name, is_deleted=False).first()
    if setting is None or not setting.is_active:
        return None
    try:
        return int(setting.value.strip())
    except ValueError:
        return None


def set_schedule_date_offset(name, days):
    if name not in SCHEDULE_DATE_OFFSET_NAMES:
        raise KeyError(name)
    BaseSetting.objects.update_or_create(
        name=name,
        defaults={"value": "" if days is None else str(days), "is_active": True, "is_deleted": False},
    )
