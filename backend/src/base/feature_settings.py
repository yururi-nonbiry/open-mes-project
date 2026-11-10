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
