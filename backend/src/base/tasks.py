import csv
import io
import os
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.db import models
from django.utils import timezone

from master.models import StockPurpose, WorkCenter

from .csv_io import decode_csv_bytes, unescape_formula
from .feature_settings import apply_terms
from .model_utils import CSV_IMPORT_FK_ALIASES
from .models import DATA_TYPE_MODEL_MAPPING, AsyncTask, CsvColumnMapping


# 在庫・受注・生産計画の状態や集計値は業務処理(入庫・引当・出庫・進捗更新)と連動して整合性を保つ必要が
# あるため、CSVインポートで直接上書きさせない。
# 項目はモデルのフィールド名(外部キーは <名前>_rel ではなくフィールド名そのもの)で指定する。
PROTECTED_IMPORT_FIELDS = {
    "inventory": {"reserved"},
    "purchase_order": {"received_quantity", "status"},
    "sales_order": {"shipped_quantity", "reserved_quantity", "status"},
    "production_plan": {
        "status",
        "actual_start_datetime",
        "actual_end_datetime",
        # 完成品の計上先は完了報告で、統合・子計画の関係は統合・中間品の手配で決まる
        "finished_goods_warehouse",
        "finished_goods_location",
        "merged_into",
        "parent_plan",
    },
}

# CSVで取り込めないデータ種別(作成・更新が在庫の計上などの業務処理と一体のため)
IMPORT_DISABLED_DATA_TYPES = {
    "goods_receipt": "入庫実績は在庫の計上と一体のため、CSVでは取り込めません。入庫処理から登録してください。",
}

# 在庫行を識別する項目。既存の在庫行でこれらを変えると入出庫履歴が残らないため、CSVでも変更させない。
INVENTORY_IDENTITY_FIELDS = ("part_number_rel", "warehouse_rel", "location", "purpose_rel")

# 空欄のセルで値を変えない(取り込まない)ことを表す
_OMIT = object()

DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
)


def _normalize_number(value):
    """Excel保存で変わりうる数値表記を、Decimalで解釈できる文字列に揃える。"""
    text = unicodedata.normalize("NFKC", value).replace(",", "").replace(" ", "")
    try:
        return str(Decimal(text))
    except InvalidOperation:
        raise ValueError("数値ではありません。")


def _convert_value(field_obj, value):
    if isinstance(field_obj, (models.DateTimeField, models.DateField)):
        for fmt in DATE_FORMATS:
            try:
                parsed = datetime.strptime(value, fmt)
                break
            except ValueError:
                continue
        else:
            raise ValueError("対応する日付形式ではありません。")
        if isinstance(field_obj, models.DateTimeField):
            # USE_TZ=True のため、タイムゾーン無しの日時はプロジェクトのタイムゾーンとして解釈する
            return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        return parsed.date()
    if isinstance(field_obj, models.BooleanField):
        return value.lower() in ["true", "1", "yes", "t", "はい"]
    if isinstance(field_obj, (models.IntegerField, models.PositiveIntegerField)):
        number = _normalize_number(value)
        as_decimal = Decimal(number)
        if as_decimal != as_decimal.to_integral_value():
            raise ValueError("整数ではありません。")
        return int(as_decimal)
    if isinstance(field_obj, (models.DecimalField, models.FloatField)):
        # Excelの桁区切り(1,000)・指数表記(1.00E+05)・全角数字を許容して正規化する
        return _normalize_number(value)
    return value


def _empty_value(field_obj):
    """
    CSVにある列のセルが空欄のときに設定する値。空欄は値のクリアとして扱い、
    NULL可の項目は None、文字列項目は空文字にする。それ以外(必須の数値・真偽値など)は変更しない。
    """
    if field_obj.null:
        return None
    if isinstance(field_obj, (models.CharField, models.TextField)):
        return ""
    return _OMIT


def _check_purpose(model, data_type, update_kwargs, defaults_data):
    """用途コードの存在・有効性と、引当済みの受注・計画の用途変更を確認し、問題があればメッセージを返す。"""
    if "purpose" not in defaults_data:
        return None
    purpose = defaults_data["purpose"]
    if purpose is not None and not StockPurpose.objects.filter(code=purpose, is_active=True).exists():
        return f"用途 '{purpose}' が存在しないか、無効です。"
    # 引当のある受注・生産計画は、引当と同じ用途の在庫を動かす必要があるため用途を変更できない
    existing = model.objects.filter(**update_kwargs).first()
    if existing is None or existing.purpose == purpose:
        return None
    if data_type == "sales_order" and existing.reserved_quantity > 0:
        return "引当済みの受注は用途を変更できません。"
    if data_type == "production_plan":
        from production.services.materials import normal_allocations

        if normal_allocations(existing.material_allocations.all()).exists():
            return apply_terms("部品の引当がある生産計画の用途は変更できません。")
    return None


def _check_line(defaults_data):
    """ライン(ワークセンター)コードの存在を確認し、問題があればメッセージを返す。"""
    line = defaults_data.get("line")
    if line is None:
        return None
    if not WorkCenter.objects.filter(code=line).exists():
        return f"ライン '{line}' が存在しません。"
    return None


def _field_values(model, values):
    """{フィールド名 or <外部キー>_id: 値} を {フィールド名: 値} に揃える(外部キーは参照先のコード)。"""
    result = {}
    for key, value in values.items():
        try:
            field = model._meta.get_field(key)
        except FieldDoesNotExist:
            result[key] = value
            continue
        result[field.name] = value
    return result


def _check_sales_order(update_kwargs, defaults_data):
    """生産計画の引当に連動する内部受注(INT-)は、CSVで作成・変更させない。"""
    from inventory.models import SalesOrder

    order_number = update_kwargs.get("order_number") or defaults_data.get("order_number") or ""
    existing = SalesOrder.objects.filter(**update_kwargs).first()
    if order_number.startswith(SalesOrder.INTERNAL_ORDER_PREFIX) or (existing and existing.is_internal):
        return "生産計画の引当に連動する内部受注(INT-)はCSVで取り込めません。"
    return None


def _check_inventory(update_kwargs, defaults_data):
    """既存の在庫行の品番・倉庫・棚番・用途の変更と、引当の残る在庫の無効化を拒否する。"""
    from inventory.models import Inventory

    existing = Inventory.objects.filter(**update_kwargs).first()
    if existing is None:
        return None
    values = _field_values(Inventory, defaults_data)
    for field in INVENTORY_IDENTITY_FIELDS:
        current = getattr(existing, Inventory._meta.get_field(field).attname)
        if field in values and (values[field] or None) != (current or None):
            return "既存の在庫の品番・倉庫・棚番・用途はCSVで変更できません。棚の移動・用途の変更から行ってください。"
    if values.get("is_active") is False and existing.is_active and existing.reserved > 0:
        return "引当済みの在庫は無効にできません。"
    return None


def _check_production_plan(update_kwargs, defaults_data):
    """生産計画は画面・APIと同じ検証(完了・統合・引当の状態による変更制限、日時の前後)を通す。"""
    from rest_framework.exceptions import ValidationError

    from master.models import Item
    from production.models import ProductionPlan
    from production.serializers import ProductionPlanSerializer

    existing = ProductionPlan.objects.filter(**update_kwargs).first()
    values = _field_values(ProductionPlan, defaults_data)
    attrs = {}
    if "product" in values and not values["product"]:
        return "製品品番は空欄にできません。"
    for name, value in values.items():
        if name == "product":
            attrs["product"] = Item.objects.filter(code=value).first() if value else None
            if value and attrs["product"] is None:
                return f"製品 '{value}' が存在しません。"
        elif name == "purpose_rel":
            attrs["purpose_rel"] = StockPurpose.objects.filter(code=value).first() if value else None
        elif name in ("planned_quantity", "planned_start_datetime", "planned_end_datetime", "remarks", "plan_name"):
            attrs[name] = value
        elif name == "line_rel":
            attrs["line_rel"] = WorkCenter.objects.filter(code=value).first() if value else None
    try:
        ProductionPlanSerializer(instance=existing).validate(attrs)
    except ValidationError as e:
        detail = e.detail
        messages = detail.values() if isinstance(detail, dict) else [detail]
        flat = [m for group in messages for m in (group if isinstance(group, list) else [group])]
        return "; ".join(str(m) for m in flat)
    return None


ROW_CHECKS = {
    "sales_order": _check_sales_order,
    "inventory": _check_inventory,
    "production_plan": _check_production_plan,
}


def _save_row(model, data_type, update_kwargs, defaults_data):
    """1行を保存し、作成したかを返す。在庫数量は在庫調整として入出庫履歴を残して反映する。"""
    from django.db import transaction

    if data_type != "inventory" or "quantity" not in defaults_data:
        _, created = model.objects.update_or_create(**update_kwargs, defaults=defaults_data)
        return created

    from inventory.services import InventoryServiceError, adjust_inventory

    quantity = defaults_data.pop("quantity")
    with transaction.atomic():
        inventory, created = model.objects.update_or_create(**update_kwargs, defaults=defaults_data)
        try:
            # 数量は直接書き換えず、在庫調整(差分を入出庫履歴に記録・引当済数量未満は不可)で反映する
            adjust_inventory(inventory.pk, quantity, None, None, confirm_mixed_purpose=True)
        except InventoryServiceError as e:
            raise ValueError(e.message) from None
    return created


def _is_revoked(task_id):
    # csv-import-cancel アクションが AsyncTask を REVOKED に更新するため、DB上の状態で判定する
    return AsyncTask.objects.filter(task_id=task_id, status="REVOKED").exists()


@shared_task(bind=True)
def import_csv_task(self, data_type, file_path):
    """
    CSVファイルを1行ずつ取り込む。エラー行はスキップして他の行の取り込みを継続し
    (エラー行は結果に列挙する)、キャンセル時はそれまでに取り込んだ行は保持される。
    """
    task_id = self.request.id
    task = None
    try:
        task, _ = AsyncTask.objects.get_or_create(
            task_id=task_id, defaults={"task_name": f"CSV Import: {data_type}", "status": "PENDING"}
        )
        if task.status == "REVOKED":
            return {"status": "REVOKED", "message": "タスクがキャンセルされました。"}
        task.status = "STARTED"
        task.save()

        if data_type in IMPORT_DISABLED_DATA_TYPES:
            raise Exception(IMPORT_DISABLED_DATA_TYPES[data_type])

        mappings = CsvColumnMapping.objects.filter(data_type=data_type, is_active=True).order_by("order")
        if not mappings.exists():
            raise Exception(f'"{data_type}" に有効なCSVマッピング設定がありません。')

        model_string = DATA_TYPE_MODEL_MAPPING.get(data_type)
        if not model_string:
            raise Exception(f'"{data_type}" はインポート対象外のデータ種別です。')
        app_label, model_name = model_string.split(".")
        model = apps.get_model(app_label=app_label, model_name=model_name)

        header_to_model_map = {m.csv_header: m.model_field_name for m in mappings}
        update_keys_model = [m.model_field_name for m in mappings if m.is_update_key]

        if not update_keys_model:
            raise Exception("CSVインポートのための上書きキーがCSVマッピング設定で指定されていません。")

        fk_aliases = CSV_IMPORT_FK_ALIASES.get(data_type, {})
        field_objs = {}
        for model_field_name in header_to_model_map.values():
            try:
                field_objs[model_field_name] = model._meta.get_field(model_field_name)
            except FieldDoesNotExist:
                if model_field_name in fk_aliases:
                    # 外部キーの別名(用途コード)は、外部キーの実フィールド(<別名>_rel)の値(コード)として扱う
                    field_objs[model_field_name] = model._meta.get_field(fk_aliases[model_field_name])
                    continue
                raise Exception(f"マッピング設定の項目 '{model_field_name}' は {model_string} に存在しません。")

        # 外部キーは <名前>_id でも指定できるため、フィールド名に揃えて確認する
        protected = sorted(
            name
            for name, field in field_objs.items()
            if field.name in PROTECTED_IMPORT_FIELDS.get(data_type, set())
        )
        if protected:
            raise Exception(
                f"次の項目は業務処理と連動するためCSVで取り込めません。マッピング設定から外してください: "
                f"{', '.join(protected)}"
            )

        with open(file_path, "rb") as f:
            content = decode_csv_bytes(f.read())

        # Excelで編集・保存したCSVにはセル内改行や末尾の空行が含まれうるため、
        # 行数はcsvモジュールで数える(空行は取込対象にも件数にも含めない)。
        reader = csv.DictReader(io.StringIO(content, newline=""))
        reader.fieldnames = [(h or "").strip() for h in (reader.fieldnames or [])]
        if not set(reader.fieldnames) & set(header_to_model_map):
            raise Exception(
                "CSVのヘッダー行がマッピング設定の列名と一致しません。"
                f"(想定: {', '.join(header_to_model_map)} / 実際: {', '.join(reader.fieldnames) or '空'})"
            )
        # (Excelで見える行番号, 行データ)。空行を飛ばしてもエラー報告の行番号がずれないようにする。
        rows = [
            (reader.line_num, r) for r in reader if any((v or "").strip() for v in r.values() if isinstance(v, str))
        ]
        present_headers = set(reader.fieldnames)
        total_rows = len(rows)
        task.total = total_rows
        task.save()

        created_count = 0
        updated_count = 0
        errors_list = []

        for i, (line_no, row) in enumerate(rows, start=1):
            if _is_revoked(task_id):
                return {"status": "REVOKED", "message": "タスクがキャンセルされました。"}

            model_data = {}
            row_specific_errors = []

            for csv_header, model_field_name in header_to_model_map.items():
                if csv_header not in present_headers:
                    continue  # CSVに無い列は変更しない
                # 書き出し時に数式対策で付けた先頭の ' は外す
                value = unescape_formula((row.get(csv_header) or "").strip())
                if not value:
                    # 空欄は値のクリア(NULL可は None、文字列は空文字)。必須の数値などは変更しない
                    empty = _empty_value(field_objs[model_field_name])
                    if empty is not _OMIT:
                        model_data[model_field_name] = empty
                    continue
                try:
                    model_data[model_field_name] = _convert_value(field_objs[model_field_name], value)
                except (ValueError, TypeError) as e:
                    row_specific_errors.append(f"フィールド '{csv_header}' の値 '{value}' は型が不正です: {e}")

            if row_specific_errors:
                errors_list.append(f"行 {line_no}: {'; '.join(row_specific_errors)}")
            else:
                # 上書きキーは空欄を許さない(棚番のように空文字が「棚番なし」を表す文字列項目は空文字で照合する)
                update_kwargs = {
                    key: model_data.pop(key)
                    for key in update_keys_model
                    if key in model_data
                    and model_data[key] is not None
                    and (model_data[key] != "" or field_objs[key].blank)
                }
                if len(update_kwargs) != len(update_keys_model):
                    errors_list.append(
                        f"行 {line_no}: 上書きキー ({', '.join(update_keys_model)}) の値が空、または見つかりません。"
                    )
                else:
                    defaults_data = dict(model_data)
                    try:
                        purpose_error = _check_purpose(model, data_type, update_kwargs, defaults_data)
                        if purpose_error:
                            raise ValueError(purpose_error)
                        line_error = _check_line(defaults_data)
                        if line_error:
                            raise ValueError(line_error)
                        for alias, fk_name in fk_aliases.items():
                            if alias in defaults_data:
                                defaults_data[f"{fk_name}_id"] = defaults_data.pop(alias)
                            if alias in update_kwargs:
                                update_kwargs[f"{fk_name}_id"] = update_kwargs.pop(alias)
                        row_check = ROW_CHECKS.get(data_type)
                        row_error = row_check(update_kwargs, defaults_data) if row_check else None
                        if row_error:
                            raise ValueError(row_error)
                        # 行全体を1つのトランザクションで囲まないことで、進捗(task.progress)が
                        # 取込中にも他の接続(進捗確認API)から見えるようにしている。
                        # update_or_create は内部で行単位のトランザクションを張る。
                        created = _save_row(model, data_type, update_kwargs, defaults_data)
                        if created:
                            created_count += 1
                        else:
                            updated_count += 1
                    except Exception as e:
                        errors_list.append(f"行 {line_no} ({update_kwargs}): データベース保存エラー - {e}")

            task.progress = i
            task.save(update_fields=["progress", "updated_at"])

        task.status = "SUCCESS" if not errors_list else "FAILURE"
        task.result = {"created": created_count, "updated": updated_count, "errors": errors_list}
        task.progress = total_rows
        task.save()

    except SoftTimeLimitExceeded:
        if task is not None:
            task.status = "FAILURE"
            task.result = {"error": "タイムアウトしました。"}
            task.save()
    except Exception as e:
        if task is not None:
            task.status = "FAILURE"
            task.result = {"error": str(e)}
            task.save()
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)
