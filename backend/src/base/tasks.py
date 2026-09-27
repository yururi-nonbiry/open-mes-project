import csv
import io
import os
from datetime import datetime

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.db import models
from django.utils import timezone

from .models import DATA_TYPE_MODEL_MAPPING, AsyncTask, CsvColumnMapping


# 在庫・受注・生産計画の状態や集計値は業務処理(入庫・引当・出庫・進捗更新)と連動して整合性を保つ必要が
# あるため、CSVインポートで直接上書きさせない。
PROTECTED_IMPORT_FIELDS = {
    "inventory": {"reserved"},
    "purchase_order": {"received_quantity", "status"},
    "sales_order": {"shipped_quantity", "reserved_quantity", "status"},
    "production_plan": {"status", "actual_start_datetime", "actual_end_datetime"},
}

DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
)


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
    if isinstance(field_obj, (models.IntegerField, models.PositiveIntegerField)):
        return int(float(value))
    if isinstance(field_obj, models.BooleanField):
        return value.lower() in ["true", "1", "yes", "t", "はい"]
    return value


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

        protected = PROTECTED_IMPORT_FIELDS.get(data_type, set()) & set(header_to_model_map.values())
        if protected:
            raise Exception(
                f"次の項目は業務処理と連動するためCSVで取り込めません。マッピング設定から外してください: "
                f"{', '.join(sorted(protected))}"
            )

        field_objs = {}
        for model_field_name in header_to_model_map.values():
            try:
                field_objs[model_field_name] = model._meta.get_field(model_field_name)
            except FieldDoesNotExist:
                raise Exception(f"マッピング設定の項目 '{model_field_name}' は {model_string} に存在しません。")

        with open(file_path, "r", encoding="utf-8-sig") as f:
            content = f.read()

        # ファイルの行数をカウントしてtotalを設定
        total_rows = len(content.splitlines()) - 1  # ヘッダーを除く
        task.total = total_rows
        task.save()

        reader = csv.DictReader(io.StringIO(content))

        created_count = 0
        updated_count = 0
        errors_list = []

        for i, row in enumerate(reader, start=1):
            if _is_revoked(task_id):
                return {"status": "REVOKED", "message": "タスクがキャンセルされました。"}

            model_data = {}
            row_specific_errors = []

            for csv_header, model_field_name in header_to_model_map.items():
                value = (row.get(csv_header) or "").strip()
                if not value:
                    model_data[model_field_name] = None
                    continue
                try:
                    model_data[model_field_name] = _convert_value(field_objs[model_field_name], value)
                except (ValueError, TypeError) as e:
                    row_specific_errors.append(f"フィールド '{csv_header}' の値 '{value}' は型が不正です: {e}")

            if row_specific_errors:
                errors_list.append(f"行 {i + 1}: {'; '.join(row_specific_errors)}")
            else:
                update_kwargs = {
                    key: model_data.pop(key)
                    for key in update_keys_model
                    if key in model_data and model_data[key] is not None
                }
                if len(update_kwargs) != len(update_keys_model):
                    errors_list.append(
                        f"行 {i + 1}: 上書きキー ({', '.join(update_keys_model)}) の値が空、または見つかりません。"
                    )
                else:
                    defaults_data = {k: v for k, v in model_data.items() if v is not None}
                    try:
                        # 行全体を1つのトランザクションで囲まないことで、進捗(task.progress)が
                        # 取込中にも他の接続(進捗確認API)から見えるようにしている。
                        # update_or_create は内部で行単位のトランザクションを張る。
                        _, created = model.objects.update_or_create(**update_kwargs, defaults=defaults_data)
                        if created:
                            created_count += 1
                        else:
                            updated_count += 1
                    except Exception as e:
                        errors_list.append(f"行 {i + 1} ({update_kwargs}): データベース保存エラー - {e}")

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
