from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class InventoryLocationMigrationTests(TransactionTestCase):
    """INV-MIG-01: 棚番NULLの在庫を空文字の在庫へ統合するマイグレーション(0021)。"""

    migrate_from = [("inventory", "0020_salesorder_reserved_quantity")]
    migrate_to = [("inventory", "0021_inventory_location_not_null")]

    def setUp(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        # masterアプリのテーブルは最新のまま(ロールバック対象外)のため、現在のモデルで作成する
        from master.models import Item, Warehouse

        Inventory = old_apps.get_model("inventory", "Inventory")
        Item.objects.create(code="MIG-1", name="Mig 1", item_type="material")
        Warehouse.objects.create(warehouse_number="MIG-WH", name="Mig WH")
        Inventory.objects.create(part_number_rel_id="MIG-1", warehouse_rel_id="MIG-WH", location=None, quantity=3, reserved=1)
        Inventory.objects.create(part_number_rel_id="MIG-1", warehouse_rel_id="MIG-WH", location=None, quantity=4)
        Inventory.objects.create(part_number_rel_id="MIG-1", warehouse_rel_id="MIG-WH", location="", quantity=5, reserved=2)
        Inventory.objects.create(part_number_rel_id="MIG-1", warehouse_rel_id="MIG-WH", location="A-01", quantity=7)

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(self.migrate_to)
        self.apps = executor.loader.project_state(self.migrate_to).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_inv_mig_01_null_locations_merged_into_blank(self):
        Inventory = self.apps.get_model("inventory", "Inventory")
        rows = {r.location: r for r in Inventory.objects.filter(part_number_rel_id="MIG-1")}
        self.assertEqual(set(rows), {"", "A-01"})
        self.assertEqual((rows[""].quantity, rows[""].reserved), (12, 3))
        self.assertEqual(rows["A-01"].quantity, 7)
