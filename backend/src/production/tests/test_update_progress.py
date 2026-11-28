from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from inventory.models import Inventory, SalesOrder, StockMovement

from ..models import ProductionPlan, WorkProgress
from ..services import update_production_progress_service
from .test_helpers import ProductionAPITestBase

PROCESS_STEP_OVERALL = "Overall Plan Progress"


class UpdateProgressTests(ProductionAPITestBase):
    """PP-PROG-* : 生産計画進捗更新アクション (POST plans/{id}/update-progress/)。"""

    def _url(self, plan):
        return reverse("production_api:production-plan-update-progress", args=[plan.id])

    def test_pp_prog_01_pending_to_in_progress(self):
        plan = self.create_plan(status="PENDING")
        response = self.client.post(self._url(plan), {"status": "IN_PROGRESS"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "IN_PROGRESS")
        self.assertIsNotNone(plan.actual_start_datetime)
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.status, "IN_PROGRESS")

    def test_pp_prog_02_in_progress_to_completed_adjusts_finished_goods_inventory(self):
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 10}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.product_item.code, warehouse_rel_id=self.warehouse_fg.warehouse_number
        )
        self.assertEqual(inventory.quantity, 10)
        self.assertTrue(
            StockMovement.objects.filter(movement_type="PRODUCTION_OUTPUT", quantity=10).exists()
        )
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.quantity_completed, 10)

    def test_pp_prog_03_completed_without_good_quantity_rejected(self):
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(self._url(plan), {"status": "COMPLETED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_04_good_plus_defective_exceeds_actual_rejected(self):
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(
            self._url(plan),
            {"status": "COMPLETED", "good_quantity": 8, "defective_quantity": 5, "actual_quantity": 10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_05_completing_consumes_allocated_materials(self):
        plan = self.create_plan(status="IN_PROGRESS")
        material_inventory = self.create_inventory(
            part_number=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=10, reserved=5
        )
        allocation = self.create_material_allocation(
            production_plan=plan,
            material_code=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            allocated_quantity=5,
            status="ALLOCATED",
        )
        so_number = f"INT-{allocation.id.hex[-15:]}"
        SalesOrder.objects.create(
            order_number=so_number,
            item=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=5,
            status="pending",
        )

        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        allocation.refresh_from_db()
        self.assertEqual(allocation.status, "ISSUED")
        material_inventory.refresh_from_db()
        self.assertEqual(material_inventory.quantity, 5)
        self.assertEqual(material_inventory.reserved, 0)
        self.assertTrue(StockMovement.objects.filter(movement_type="used", quantity=5).exists())
        so = SalesOrder.objects.get(order_number=so_number)
        self.assertEqual(so.status, "shipped")
        self.assertEqual(so.shipped_quantity, 5)

    def test_pp_prog_06_re_reporting_completed_applies_diff_only(self):
        plan = self.create_plan(status="COMPLETED")
        self.create_inventory(
            part_number=self.product_item.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=10,
        )
        WorkProgress.objects.create(
            production_plan=plan, process_step=PROCESS_STEP_OVERALL, status="COMPLETED", quantity_completed=10
        )

        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 15}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.product_item.code, warehouse_rel_id=self.warehouse_fg.warehouse_number
        )
        self.assertEqual(inventory.quantity, 15, "差分(15-10=5)のみ加算されること")

    def test_pp_prog_07_leaving_completed_reverses_inventory_and_restores_materials(self):
        plan = self.create_plan(status="COMPLETED")
        finished_inventory = self.create_inventory(
            part_number=self.product_item.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=10,
        )
        material_inventory = self.create_inventory(
            part_number=self.material_item1.code, warehouse=self.warehouse_a.warehouse_number, quantity=5, reserved=0
        )
        allocation = self.create_material_allocation(
            production_plan=plan,
            material_code=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            allocated_quantity=5,
            status="ISSUED",
        )
        so_number = f"INT-{allocation.id.hex[-15:]}"
        SalesOrder.objects.create(
            order_number=so_number,
            item=self.material_item1.code,
            warehouse=self.warehouse_a.warehouse_number,
            quantity=5,
            status="shipped",
            shipped_quantity=5,
        )
        WorkProgress.objects.create(
            production_plan=plan, process_step=PROCESS_STEP_OVERALL, status="COMPLETED", quantity_completed=10
        )

        response = self.client.post(self._url(plan), {"status": "ON_HOLD"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        finished_inventory.refresh_from_db()
        self.assertEqual(finished_inventory.quantity, 0)
        self.assertTrue(StockMovement.objects.filter(movement_type="PRODUCTION_REVERSAL").exists())

        material_inventory.refresh_from_db()
        self.assertEqual(material_inventory.quantity, 10)
        self.assertEqual(material_inventory.reserved, 5)
        allocation.refresh_from_db()
        self.assertEqual(allocation.status, "ALLOCATED")
        so = SalesOrder.objects.get(order_number=so_number)
        self.assertEqual(so.status, "pending")
        self.assertEqual(so.shipped_quantity, 0)

        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.quantity_completed, 0)
        self.assertEqual(wp.status, "PAUSED")

    def test_pp_prog_08_reversal_insufficient_stock_rejected(self):
        plan = self.create_plan(status="COMPLETED")
        self.create_inventory(
            part_number=self.product_item.code,
            warehouse=self.warehouse_fg.warehouse_number,
            location="FG-01",
            quantity=5,
        )
        WorkProgress.objects.create(
            production_plan=plan, process_step=PROCESS_STEP_OVERALL, status="COMPLETED", quantity_completed=10
        )

        response = self.client.post(self._url(plan), {"status": "ON_HOLD"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_09_in_progress_to_cancelled(self):
        plan = self.create_plan(status="IN_PROGRESS", actual_start_datetime=timezone.now())
        response = self.client.post(self._url(plan), {"status": "CANCELLED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan.refresh_from_db()
        self.assertIsNotNone(plan.actual_end_datetime)
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.status, "PAUSED")

    def test_pp_prog_10_missing_status_rejected(self):
        plan = self.create_plan(status="PENDING")
        response = self.client.post(self._url(plan), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pp_prog_11_on_hold_to_pending(self):
        plan = self.create_plan(status="ON_HOLD")
        response = self.client.post(self._url(plan), {"status": "PENDING"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        wp = WorkProgress.objects.get(production_plan=plan, process_step=PROCESS_STEP_OVERALL)
        self.assertEqual(wp.status, "NOT_STARTED")

    def test_pp_prog_12_invalid_status_rejected(self):
        plan = self.create_plan(status="PENDING")
        response = self.client.post(self._url(plan), {"status": "DONE"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "PENDING")

    def test_pp_prog_13_stale_plan_does_not_double_count_finished_goods(self):
        """二重送信の再現: 完了前に取得した(古い)計画オブジェクトで再度完了報告しても差分のみ計上される。"""
        plan = self.create_plan(status="IN_PROGRESS")
        stale_plan = ProductionPlan.objects.get(pk=plan.pk)
        update_production_progress_service(plan, {"status": "COMPLETED", "good_quantity": 10}, self.user)
        update_production_progress_service(stale_plan, {"status": "COMPLETED", "good_quantity": 10}, self.user)
        inventory = Inventory.objects.get(
            part_number_rel_id=self.product_item.code, warehouse_rel_id=self.warehouse_fg.warehouse_number
        )
        self.assertEqual(inventory.quantity, 10)

    # ---- 完成品の計上先(品番マスタのデフォルト入庫倉庫・棚番) ----

    def _set_product_default(self, warehouse, location=None):
        self.product_item.default_warehouse = warehouse
        self.product_item.default_location = location
        self.product_item.save()

    def _finished_qty(self, warehouse, location=None):
        rows = Inventory.objects.filter(part_number_rel_id=self.product_item.code, warehouse_rel_id=warehouse)
        if location is not None:
            rows = rows.filter(location=location)
        return sum(row.quantity for row in rows)

    def test_pp_prog_14_completion_uses_item_default_warehouse_and_location(self):
        """PP-PROG-14: 品番マスタのデフォルト入庫倉庫・棚番へ完成品を計上し、計上倉庫を計画に記録する。"""
        self._set_product_default(self.warehouse_a.warehouse_number, "A-09")
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(self._url(plan), {"status": "COMPLETED", "good_quantity": 10}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number, "A-09"), 10)
        self.assertEqual(self._finished_qty(self.warehouse_fg.warehouse_number), 0)
        plan.refresh_from_db()
        self.assertEqual(plan.finished_goods_warehouse, self.warehouse_a.warehouse_number)

    def test_pp_prog_15_quantity_change_after_master_change_uses_recorded_warehouse(self):
        """PP-PROG-15: 完了後に品番マスタを変えても、完了数量の増減・完了の取消は計上した倉庫に対して行う。"""
        self._set_product_default(self.warehouse_a.warehouse_number, "A-09")
        plan = self.create_plan(status="IN_PROGRESS")
        update_production_progress_service(plan, {"status": "COMPLETED", "good_quantity": 10}, self.user)

        self._set_product_default(self.warehouse_fg.warehouse_number, "FG-09")
        plan.refresh_from_db()
        update_production_progress_service(plan, {"status": "COMPLETED", "good_quantity": 15}, self.user)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number, "A-09"), 15)
        self.assertEqual(self._finished_qty(self.warehouse_fg.warehouse_number), 0)

        plan.refresh_from_db()
        update_production_progress_service(plan, {"status": "ON_HOLD"}, self.user)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number), 0)
        plan.refresh_from_db()
        self.assertIsNone(plan.finished_goods_warehouse, "完了の取消で入庫倉庫の記録を消す")
        self.assertIsNone(plan.finished_goods_location)

    def test_pp_prog_16_item_default_location_not_used_for_other_warehouse(self):
        """PP-PROG-16: デフォルト入庫倉庫が未登録なら既定の完成品倉庫へ、デフォルト入庫棚番の棚に計上する。"""
        self._set_product_default(None, "X-01")
        plan = self.create_plan(status="IN_PROGRESS")
        update_production_progress_service(plan, {"status": "COMPLETED", "good_quantity": 4}, self.user)
        self.assertEqual(self._finished_qty(self.warehouse_fg.warehouse_number, "X-01"), 4)

    def test_pp_prog_17_completion_with_zero_quantity_records_warehouse(self):
        """PP-PROG-17: 良品0で完了しても計上倉庫を記録し、後から増やした完了数量も同じ倉庫へ計上する。"""
        self._set_product_default(self.warehouse_a.warehouse_number)
        plan = self.create_plan(status="IN_PROGRESS")
        update_production_progress_service(
            plan, {"status": "COMPLETED", "good_quantity": 0, "defective_quantity": 1, "actual_quantity": 1}, self.user
        )
        plan.refresh_from_db()
        self.assertEqual(plan.finished_goods_warehouse, self.warehouse_a.warehouse_number)

        self._set_product_default(self.warehouse_fg.warehouse_number)
        update_production_progress_service(plan, {"status": "COMPLETED", "good_quantity": 3}, self.user)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number), 3)

    def test_pp_prog_18_unknown_default_warehouse_rejected(self):
        """PP-PROG-18: 品番マスタのデフォルト入庫倉庫は倉庫マスターへの外部キーのため、存在しない倉庫は登録できない。"""
        from django.db import IntegrityError, connection, transaction

        # 外部キーの検査はコミット時まで遅延されるため、明示的に検査する
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._set_product_default("NO-SUCH-WH")
            connection.check_constraints(table_names=["master_item"])

    def test_pp_prog_19_completion_uses_requested_warehouse_and_location(self):
        """PP-PROG-19: 完了報告で指定した入庫倉庫・棚番へ計上し、品番マスタのデフォルトより優先する。"""
        self._set_product_default(self.warehouse_a.warehouse_number, "A-09")
        plan = self.create_plan(status="IN_PROGRESS")
        response = self.client.post(
            self._url(plan),
            {
                "status": "COMPLETED",
                "good_quantity": 6,
                "warehouse": self.warehouse_fg.warehouse_number,
                "location": "FG-05",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._finished_qty(self.warehouse_fg.warehouse_number, "FG-05"), 6)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number), 0)
        plan.refresh_from_db()
        self.assertEqual(plan.finished_goods_warehouse, self.warehouse_fg.warehouse_number)
        self.assertEqual(plan.finished_goods_location, "FG-05")

    def test_pp_prog_20_requested_warehouse_without_location(self):
        """PP-PROG-20: 倉庫だけ指定した場合、別倉庫の品番マスタのデフォルト棚番は使わず棚番なしで計上する。"""
        self._set_product_default(self.warehouse_a.warehouse_number, "A-09")
        plan = self.create_plan(status="IN_PROGRESS")
        update_production_progress_service(
            plan,
            {"status": "COMPLETED", "good_quantity": 2, "warehouse": self.warehouse_fg.warehouse_number},
            self.user,
        )
        self.assertEqual(self._finished_qty(self.warehouse_fg.warehouse_number, ""), 2)

    def test_pp_prog_21_changing_warehouse_after_completion_rejected(self):
        """PP-PROG-21: 完了済みの計画の完了数量を変えるとき、別の入庫倉庫は指定できない(同じ倉庫は可)。"""
        plan = self.create_plan(status="IN_PROGRESS")
        update_production_progress_service(
            plan, {"status": "COMPLETED", "good_quantity": 5, "warehouse": self.warehouse_a.warehouse_number}, self.user
        )
        plan.refresh_from_db()
        response = self.client.post(
            self._url(plan),
            {"status": "COMPLETED", "good_quantity": 7, "warehouse": self.warehouse_fg.warehouse_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number), 5)

        response = self.client.post(
            self._url(plan),
            {"status": "COMPLETED", "good_quantity": 7, "warehouse": self.warehouse_a.warehouse_number},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number), 7)

    def test_pp_prog_22_plan_api_returns_finished_goods_destination(self):
        """PP-PROG-22: 生産計画APIは、未完了の計画では入庫倉庫・棚番の初期値を、完了済みの計画では計上先を返す。"""
        self._set_product_default(self.warehouse_a.warehouse_number, "A-09")
        plan = self.create_plan(status="IN_PROGRESS")
        detail_url = reverse("production_api:production-plan-detail", args=[plan.id])
        data = self.client.get(detail_url).json()
        self.assertEqual((data["finished_goods_warehouse"], data["finished_goods_location"]), ("WH-A", "A-09"))

        update_production_progress_service(
            plan,
            {"status": "COMPLETED", "good_quantity": 1, "warehouse": self.warehouse_fg.warehouse_number},
            self.user,
        )
        data = self.client.get(detail_url).json()
        self.assertEqual(data["finished_goods_warehouse"], self.warehouse_fg.warehouse_number)
        self.assertEqual(data["finished_goods_location"], "")

        legacy = self.create_plan(plan_name="Legacy", status="COMPLETED")
        data = self.client.get(reverse("production_api:production-plan-detail", args=[legacy.id])).json()
        # 記録の無い完了済み計画は既定の完成品倉庫
        self.assertEqual(data["finished_goods_warehouse"], self.warehouse_fg.warehouse_number)

    def test_pp_prog_23_reversal_consumes_recorded_location_first(self):
        """PP-PROG-23: 完了の取消では、同じ倉庫の他の棚の古い在庫より、完了時に計上した棚から先に減らす。"""
        old_stock = self.create_inventory(
            part_number=self.product_item.code, warehouse=self.warehouse_a.warehouse_number, location="A-01", quantity=4
        )
        plan = self.create_plan(status="IN_PROGRESS")
        update_production_progress_service(
            plan,
            {
                "status": "COMPLETED",
                "good_quantity": 6,
                "warehouse": self.warehouse_a.warehouse_number,
                "location": "A-02",
            },
            self.user,
        )
        plan.refresh_from_db()
        update_production_progress_service(plan, {"status": "ON_HOLD"}, self.user)
        self.assertEqual(self._finished_qty(self.warehouse_a.warehouse_number, "A-02"), 0)
        old_stock.refresh_from_db()
        self.assertEqual(old_stock.quantity, 4)


class CompletionRequiresMaterialStockTests(ProductionAPITestBase):
    """PP-PROG-CONSUME-* : 完了時に消費する材料の在庫が見つからなければ完了させない。"""

    def test_pp_prog_consume_01_completion_rejected_when_allocated_stock_inactive(self):
        plan = self.create_plan(status="IN_PROGRESS")
        inventory = self.create_inventory(quantity=10, reserved=5)
        self.create_material_allocation(production_plan=plan, allocated_quantity=5)
        Inventory.objects.filter(pk=inventory.pk).update(is_active=False)
        url = reverse("production_api:production-plan-update-progress", args=[plan.id])
        response = self.client.post(url, {"status": "COMPLETED", "good_quantity": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "IN_PROGRESS")


class CompletedDestinationLockedTests(ProductionAPITestBase):
    """PP-PROG-DEST-* : 完了後の完了数量の変更では、入庫倉庫だけでなく棚番も変えられない。"""

    def test_pp_prog_dest_01_location_change_rejected_after_completion(self):
        plan = self.create_plan(status="IN_PROGRESS")
        url = reverse("production_api:production-plan-update-progress", args=[plan.id])
        payload = {"status": "COMPLETED", "good_quantity": 5, "warehouse": "WH-A", "location": "A-05"}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, status.HTTP_200_OK)
        payload = {"status": "COMPLETED", "good_quantity": 6, "warehouse": "WH-A", "location": "A-06"}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        # 同じ棚番・棚番の指定なしなら数量を変えられる
        payload = {"status": "COMPLETED", "good_quantity": 6, "warehouse": "WH-A", "location": "A-05"}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, status.HTTP_200_OK)
        payload = {"status": "COMPLETED", "good_quantity": 7}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, status.HTTP_200_OK)
        self.assertEqual(Inventory.objects.get(part_number_rel_id=plan.product_code, location="A-05").quantity, 7)
