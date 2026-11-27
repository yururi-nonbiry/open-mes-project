from unittest import mock

from django.db import IntegrityError, connection, transaction
from django.db.models.query import QuerySet
from django.test.utils import CaptureQueriesContext

from ..models import Inventory
from ..services import get_or_create_locked_inventory, lock_source_and_target
from .test_helpers import InventoryAPITestBase


class InventoryRowRaceTests(InventoryAPITestBase):
    """INV-RACE-* : 在庫行の同時作成・2行ロックの順序。"""

    def test_inv_race_01_concurrently_created_row_is_reused(self):
        """取得時には無かった行が作成直前に別の処理で作られても、一意制約違反(500)にせず、その行を使う。"""
        existing = self.create_inventory(location="R-01", quantity=3)
        original_get = QuerySet.get
        calls = {"n": 0}

        def get_once_missing(qs, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise Inventory.DoesNotExist
            return original_get(qs, *args, **kwargs)

        with transaction.atomic(), mock.patch.object(QuerySet, "get", get_once_missing):
            row = get_or_create_locked_inventory(existing.part_number, existing.warehouse, "R-01")
        self.assertEqual(row.pk, existing.pk)
        self.assertEqual(Inventory.objects.filter(location="R-01").count(), 1)

    def test_inv_race_02_other_integrity_errors_are_raised(self):
        """在庫行の一意制約以外の違反(取り直す行が無い場合)は握りつぶさずに送出する。"""
        with transaction.atomic(), mock.patch.object(Inventory.objects, "create", side_effect=IntegrityError("x")):
            with self.assertRaises(IntegrityError):
                get_or_create_locked_inventory(self.item1.code, self.warehouse_a.warehouse_number, "NEW")

    def test_inv_race_03_source_and_target_locked_in_pk_order(self):
        """移動元・移動先は主キーの順に1つのクエリでロックする(逆向きの同時移動でもデッドロックしない)。"""
        source = self.create_inventory(location="S-01", quantity=5)
        with transaction.atomic(), CaptureQueriesContext(connection) as ctx:
            locked_source, target = lock_source_and_target(source.pk, source.warehouse, "T-01")
        lock_sql = [q["sql"] for q in ctx.captured_queries if "FOR UPDATE" in q["sql"]]
        self.assertEqual(len(lock_sql), 1)
        self.assertIn("ORDER BY", lock_sql[0])
        self.assertEqual((locked_source.pk, target.location, target.quantity), (source.pk, "T-01", 0))
