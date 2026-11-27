import re

from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from rest_framework import serializers

from .models import DATA_TYPE_MODEL_MAPPING, CsvColumnMapping, ModelDisplaySetting, QrCodeAction


class CsvColumnMappingSerializer(serializers.ModelSerializer):
    """
    CsvColumnMappingモデル用のシリアライザー。
    """

    data_type_display = serializers.CharField(source="get_data_type_display", read_only=True)

    class Meta:
        model = CsvColumnMapping
        fields = [
            "id",
            "data_type",
            "data_type_display",
            "csv_header",
            "model_field_name",
            "order",
            "is_update_key",
            "is_active",
        ]
        read_only_fields = ["data_type_display"]
        validators = []  # bulk-save時にUniqueTogetherValidatorを無効化するため


class QrCodeActionSerializer(serializers.ModelSerializer):
    """
    QrCodeActionモデル用のシリアライザー。
    """

    class Meta:
        model = QrCodeAction
        fields = [
            "id",
            "name",
            "description",
            "action_type",
            "qr_code_pattern",
            "action_name",
            "is_active",
        ]
        read_only_fields = ["id"]

    # 実装されているアクション。入庫としてマーク・在庫更新は仮実装(何もしない)のため、新たには選ばせない
    IMPLEMENTED_ACTIONS = ("update_search",)

    def validate_action_name(self, value):
        unchanged = self.instance is not None and self.instance.action_name == value
        if value not in self.IMPLEMENTED_ACTIONS and not unchanged:
            raise serializers.ValidationError("このアクションはまだ実装されていないため選べません。")
        return value

    def validate_qr_code_pattern(self, value):
        if value:
            try:
                re.compile(value)
            except re.error as e:
                raise serializers.ValidationError(f"正規表現として不正です: {e}")
        return value


# 表示設定の対象モデル。入出庫履歴はCSVインポートの対象外(models.DATA_TYPE_MODEL_MAPPING に無い)だが、
# 一覧画面の表示設定は持つため、verbose_name の解決用にここで補う。
DISPLAY_SETTING_MODEL_MAPPING = {**DATA_TYPE_MODEL_MAPPING, "stock_movement": "inventory.StockMovement"}


# 一覧画面に出せる計算項目(モデルのフィールドではない項目)の名前 {(データ種別, 項目名): 名前}
COMPUTED_FIELD_LABELS = {
    ("goods_receipt", "remaining_quantity"): "未入庫残",
    ("sales_order", "remaining_quantity"): "未出庫残",
    ("inventory", "available_quantity"): "利用可能数",
    ("inventory", "part_name"): "品名",
}


class ModelDisplaySettingSerializer(serializers.ModelSerializer):
    """
    ModelDisplaySettingモデル用のシリアライザー。
    """

    verbose_name = serializers.SerializerMethodField()

    class Meta:
        model = ModelDisplaySetting
        fields = [
            "id",
            "data_type",
            "model_field_name",
            "display_name",
            "verbose_name",
            "display_order",
            "search_order",
            "is_list_display",
            "is_search_field",
            "is_list_filter",
        ]
        validators = []  # bulk-save時にUniqueTogetherValidatorを無効化するため

    def get_verbose_name(self, obj):
        """
        モデルフィールド名からverbose_nameを取得する。
        'goods_receipt' は PurchaseOrder と Receipt の両方のフィールドを含む可能性があるため、
        両方のモデルをチェックする。
        """
        # チェック対象のモデルを決定
        models_to_check_strings = []
        if obj.data_type == "goods_receipt":
            # goods_receipt は purchase_order と receipt のフィールドを持つ
            models_to_check_strings.append(DISPLAY_SETTING_MODEL_MAPPING.get("purchase_order"))
            models_to_check_strings.append(DISPLAY_SETTING_MODEL_MAPPING.get("goods_receipt"))
        else:
            models_to_check_strings.append(DISPLAY_SETTING_MODEL_MAPPING.get(obj.data_type))

        # モデルを順番にチェックしてフィールドを探す
        # 外部キーは別名(例: supplier)で設定されるため、実フィールド名(supplier_rel)でも探す
        field_names_to_check = [obj.model_field_name, f"{obj.model_field_name}_rel"]
        for model_string in filter(None, models_to_check_strings):
            try:
                app_label, model_name = model_string.split(".")
                model = apps.get_model(app_label=app_label, model_name=model_name)
            except (LookupError, ValueError):
                continue
            for field_name in field_names_to_check:
                try:
                    field = model._meta.get_field(field_name)
                    return str(field.verbose_name) or obj.model_field_name
                except FieldDoesNotExist:
                    # このモデルにはフィールドがなかったので、次の候補・次のモデルを試す
                    continue

        # モデルフィールドに見つからなかった場合、一覧画面の計算項目(プロパティ等)の名前を返す
        computed = COMPUTED_FIELD_LABELS.get((obj.data_type, obj.model_field_name))
        if computed:
            return computed

        # それでも見つからなければフィールド名をそのまま返す
        return obj.model_field_name
