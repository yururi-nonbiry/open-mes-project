"""管理者画面から切り替える機能のON/OFF設定(BaseSetting に保存する)。"""

import json
import re

from django.utils.functional import lazy

from . import request_cache
from .models import BaseSetting


def _settings():
    """有効な BaseSetting を {名前: (値, 有効か)} で返す(リクエスト中は1回だけ問い合わせる)。"""
    return request_cache.cached(
        "base_settings",
        lambda: {
            name: (value, is_active)
            for name, value, is_active in BaseSetting.objects.filter(is_deleted=False).values_list(
                "name", "value", "is_active"
            )
        },
    )


def _active_value(name):
    """有効な設定の値(未設定・無効は None)。"""
    entry = _settings().get(name)
    if entry is None or not entry[1]:
        return None
    return entry[0]


def _save_setting(name, value):
    BaseSetting.objects.update_or_create(
        name=name, defaults={"value": value, "is_active": True, "is_deleted": False}
    )
    request_cache.invalidate()


# 入庫時、品番にデフォルト入庫棚番が未登録なら、入庫した棚番を登録するか確認する
CONFIRM_REGISTER_DEFAULT_LOCATION = "confirm_register_default_location"

# 生産計画の部品引当時、同一品番の計画をまとめて1つの統合計画にするか確認する
MERGE_PLANS_ON_ALLOCATION = "merge_plans_on_allocation"

FEATURE_DEFAULTS = {
    CONFIRM_REGISTER_DEFAULT_LOCATION: True,
    MERGE_PLANS_ON_ALLOCATION: False,
}


def get_feature_flag(name):
    default = FEATURE_DEFAULTS[name]
    value = _active_value(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "on")


def set_feature_flag(name, enabled):
    if name not in FEATURE_DEFAULTS:
        raise KeyError(name)
    _save_setting(name, "true" if enabled else "false")


# 入庫予定・出庫予定の期間フィルタの初期値(今日からの相対日数)。空=指定なし。入庫・出庫で共通。
SCHEDULE_DATE_FROM_OFFSET = "schedule_date_from_offset_days"
SCHEDULE_DATE_TO_OFFSET = "schedule_date_to_offset_days"
SCHEDULE_DATE_OFFSET_NAMES = (SCHEDULE_DATE_FROM_OFFSET, SCHEDULE_DATE_TO_OFFSET)
SCHEDULE_DATE_OFFSET_LIMIT = 3660


def get_schedule_date_offset(name):
    """相対日数(int)を返す。未設定・無効・不正値は None(指定なし)。"""
    value = _active_value(name)
    if value is None:
        return None
    try:
        return int(value.strip())
    except ValueError:
        return None


def set_schedule_date_offset(name, days):
    if name not in SCHEDULE_DATE_OFFSET_NAMES:
        raise KeyError(name)
    _save_setting(name, "" if days is None else str(days))


# スマホのピッキング画面のキーワード検索で対象にする項目(カンマ区切りで保存)。
# キー: 項目の識別子。表示名はフロントエンド側で持つ。
PICKING_SEARCH_FIELD_SETTING = "picking_search_fields"
PICKING_SEARCH_FIELD_CHOICES = (
    "product_code",
    "product_name",
    "plan_name",
    "line",
    "purpose",
    "material_code",
    "material_name",
)
# 既定は従来の検索対象(使用用途は管理者が必要に応じて追加する)
PICKING_SEARCH_FIELD_DEFAULTS = tuple(f for f in PICKING_SEARCH_FIELD_CHOICES if f != "purpose")


def get_picking_search_fields():
    """検索対象の項目キーのリスト(選択肢の順)。未設定・無効は既定。"""
    value = _active_value(PICKING_SEARCH_FIELD_SETTING)
    if value is None:
        return list(PICKING_SEARCH_FIELD_DEFAULTS)
    selected = {v.strip() for v in value.split(",")}
    return [f for f in PICKING_SEARCH_FIELD_CHOICES if f in selected]


def set_picking_search_fields(fields):
    selected = set(fields)
    _save_setting(PICKING_SEARCH_FIELD_SETTING, ",".join(f for f in PICKING_SEARCH_FIELD_CHOICES if f in selected))


# 画面・メッセージで使う用語の呼び方。文言は下記の既定の語(部品・ピッキング・出庫)で書き、
# 管理者が設定した語に置き換えて表示する。
TERM_MAX_LENGTH = 10
# キー: (BaseSetting名, 既定の語)
TERMS = {
    "part": ("part_term", "部品"),
    "picking": ("picking_term", "ピッキング"),
    "issue": ("issue_term", "出庫"),
}
# 「入出庫」は入庫・出庫の総称として使うため、出庫の置き換え対象にしない
_TERM_PATTERN = re.compile("部品|ピッキング|(?<!入)出庫")


def get_term(key):
    name, default = TERMS[key]
    value = _active_value(name)
    if value is None:
        return default
    return value.strip() or default


def get_terms():
    return {key: get_term(key) for key in TERMS}


def set_term(key, term):
    name, _default = TERMS[key]
    _save_setting(name, term)


def apply_terms(text):
    """既定の語で書いた文言を、設定された呼び方に置き換える(1回の走査で置き換える)。"""
    by_default = {default: key for key, (_name, default) in TERMS.items()}
    terms = get_terms()
    return _TERM_PATTERN.sub(lambda m: terms[by_default[m.group(0)]], text)


# 画面に出る文言のクラス定義時に使う遅延評価版(表示する時点で設定を読む)
lazy_terms = lazy(apply_terms, str)


# トップ画面に出す業務フローの表示設定(管理者がシステム全体で決める)。{フローID: visible | grayed | hidden}
WORKFLOW_VISIBILITY_SETTING = "workflow_flow_visibility"
WORKFLOW_FLOWS = ("receipt-flow", "production-plan-flow", "production-issue-flow")
WORKFLOW_VISIBILITY_CHOICES = ("visible", "grayed", "hidden")


def get_workflow_visibility():
    """業務フローごとの表示設定。未設定・不正な値のフローは表示(visible)。"""
    value = _active_value(WORKFLOW_VISIBILITY_SETTING)
    stored = {}
    if value is not None:
        try:
            stored = json.loads(value) or {}
        except (TypeError, ValueError):
            stored = {}
    return {
        flow: stored.get(flow) if stored.get(flow) in WORKFLOW_VISIBILITY_CHOICES else "visible"
        for flow in WORKFLOW_FLOWS
    }


def set_workflow_visibility(values):
    current = get_workflow_visibility()
    current.update({flow: values[flow] for flow in WORKFLOW_FLOWS if flow in values})
    _save_setting(WORKFLOW_VISIBILITY_SETTING, json.dumps(current))
    return current
