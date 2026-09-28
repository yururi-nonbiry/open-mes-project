"""
在庫(Inventory)の数量・引当を変更する業務処理。

在庫の増減は必ず行ロック(select_for_update)を取得したトランザクション内で行い、入出庫履歴
(StockMovement)を併せて記録する。Inventory.reserved は品番+倉庫(+棚番)単位のプールで
「どの受注・材料引当の分か」を区別しないため、同一品番+倉庫の棚をまとめて扱うヘルパーを提供し、
inventory/production の両アプリから利用する。
"""

import logging

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import serializers

from base.responses import INTERNAL_ERROR_MESSAGE, validation_error_body
from master.models import Warehouse

from .models import Inventory, PurchaseOrder, Receipt, SalesOrder, StockMovement
from .serializers import PurchaseOrderSerializer

logger = logging.getLogger(__name__)


class InventoryServiceError(Exception):
    """業務エラー。ビューで status_code のHTTPレスポンスに変換する。"""

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# --- 棚(ロケーション)をまたいだ在庫操作のヘルパー ---


def lock_inventory_rows(part_number, warehouse):
    """
    品番+倉庫の全棚の在庫を行ロックし、入庫が古い順(FIFO)に並べて返す。
    first_received_at が無い既存行は末尾に回し、棚番をタイブレークに使う。
    """
    return list(
        Inventory.objects.select_for_update()
        .filter(part_number_rel_id=part_number, warehouse_rel_id=warehouse)
        .order_by(F("first_received_at").asc(nulls_last=True), "location")
    )


def get_or_create_locked_inventory(part_number, warehouse, location=""):
    """品番+倉庫+棚番の在庫を行ロックして取得する。無ければ数量0で作成する。"""
    location = location or ""
    try:
        return Inventory.objects.select_for_update().get(
            part_number_rel_id=part_number, warehouse_rel_id=warehouse, location=location
        )
    except Inventory.DoesNotExist:
        return Inventory.objects.create(part_number=part_number, warehouse=warehouse, location=location, quantity=0)


def reserve_fifo(rows, quantity):
    """
    引当可能な棚から入庫が古い順に quantity を引き当てる(reserved を加算、保存まで行う)。
    呼び出し側で合計の利用可能数を確認済みであること。棚ごとの引当数の内訳を返す。
    """
    remaining = quantity
    consumed = []
    for row in rows:
        if remaining <= 0:
            break
        take = min(row.available_quantity, remaining)
        if take <= 0:
            continue
        row.reserved += take
        row.save()
        remaining -= take
        consumed.append({"location": row.location, "reserved_quantity": take})
    return consumed


def consume_fifo(rows, quantity):
    """
    入庫が古い順に物理在庫(quantity)を quantity 分消費する(保存はしない)。
    棚ごとの (row, 消費数) のリストを返す。
    """
    remaining = quantity
    consumed = []
    for row in rows:
        if remaining <= 0:
            break
        take = min(row.quantity, remaining)
        if take <= 0:
            continue
        row.quantity -= take
        remaining -= take
        consumed.append((row, take))
    return consumed


def release_reserved_fifo(rows, quantity):
    """引当(reserved)を入庫が古い順に最大 quantity 分解放する(保存はしない)。解放した数量を返す。"""
    remaining = quantity
    for row in rows:
        if remaining <= 0:
            break
        release = min(row.reserved, remaining)
        if release <= 0:
            continue
        row.reserved -= release
        remaining -= release
    return quantity - remaining


def rebalance_reserved(rows):
    """
    引当(reserved)が物理在庫(quantity)を超えている棚から、余裕のある棚へ超過分を付け替える。

    Inventory.reserved は品番+倉庫内でどの棚の在庫を引き当てているかを区別しないプールのため、
    入庫が古い順の出庫で引当のある棚の在庫が先に減った場合でも、同じ品番+倉庫の他の棚に
    付け替えることで「各棚で quantity >= reserved」を保つ(棚ごとの available_quantity が
    実態より多く見えて過剰引当されるのを防ぐ)。保存は呼び出し側で行う。
    """
    excess = 0
    for row in rows:
        if row.reserved > row.quantity:
            excess += row.reserved - row.quantity
            row.reserved = row.quantity
    for row in rows:
        if excess <= 0:
            break
        room = row.quantity - row.reserved
        if room <= 0:
            continue
        moved = min(room, excess)
        row.reserved += moved
        excess -= moved


def save_rows(rows):
    for row in rows:
        row.save()


def consume_stock(rows, quantity, own_reserved=0):
    """
    品番+倉庫の棚(rows、行ロック済み・FIFO順)から quantity を出庫する。

    - 出庫可能数は「物理在庫 - 他者の引当(= 引当合計 - own_reserved)」。不足時は
      InventoryServiceError を送出し、どの棚も変更しない。
    - 物理在庫は入庫が古い順に消費し、自身の引当分(own_reserved と quantity の小さい方)を解放した上で、
      棚間で引当を付け替えて各棚で quantity >= reserved を保ち、保存する。

    棚ごとの (row, 出庫数) のリストと、解放した引当数を返す。
    """
    total_quantity = sum(row.quantity for row in rows)
    total_reserved = sum(row.reserved for row in rows)
    own_reserved = min(own_reserved, total_reserved)
    others_reserved = total_reserved - own_reserved
    shippable_quantity = max(0, total_quantity - others_reserved)
    if shippable_quantity < quantity:
        raise InventoryServiceError(
            f"実在庫: {total_quantity}, 他の引当: {others_reserved}, "
            f"出庫可能: {shippable_quantity}, 要求: {quantity}。"
        )
    consumed = consume_fifo(rows, quantity)
    released = release_reserved_fifo(rows, min(own_reserved, quantity))
    rebalance_reserved(rows)
    save_rows(rows)
    return consumed, released


def add_stock(part_number, warehouse, quantity, reserved=0):
    """
    品番+倉庫に在庫(と引当)を戻す・追加する。棚の指定が無い処理(生産完了入庫・材料の戻し等)向けで、
    棚番なし("")の在庫があればそこへ、無ければ入庫が古い棚へ、棚が1つも無ければ棚番なしで作成して加算する。
    """
    rows = lock_inventory_rows(part_number, warehouse)
    target = next((row for row in rows if row.location == ""), None) or (rows[0] if rows else None)
    if target is None:
        target = get_or_create_locked_inventory(part_number, warehouse, "")
    target.quantity += quantity
    target.reserved += reserved
    target.save()
    return target


def _operator_or_none(user):
    return user if user is not None and user.is_authenticated else None


# --- 在庫の棚移動・調整 ---


def move_inventory(source_pk, quantity, target_warehouse, target_location, user):
    target_location = target_location or ""
    if not target_warehouse:
        raise InventoryServiceError("移動先倉庫は必須です。")
    if not Warehouse.objects.filter(warehouse_number=target_warehouse).exists():
        raise InventoryServiceError(f"移動先倉庫 '{target_warehouse}' が存在しません。")
    if quantity <= 0:
        raise InventoryServiceError("移動数量は1以上である必要があります。")

    with transaction.atomic():
        # 行ロックを取得した上で最新の状態を再取得する（同時実行によるロストアップデート防止）
        source = Inventory.objects.select_for_update().get(pk=source_pk)
        if source.warehouse == target_warehouse and (source.location or "") == target_location:
            raise InventoryServiceError("移動元と移動先が同じです。")

        available_to_move = source.quantity - source.reserved
        if quantity > available_to_move:
            raise InventoryServiceError(
                f"移動数量が利用可能在庫数(引当済みを除く)を超えています。利用可能: {available_to_move}"
            )

        source.quantity -= quantity
        source.save()

        target = get_or_create_locked_inventory(source.part_number, target_warehouse, target_location)
        target.quantity += quantity
        target.save()

        operator = _operator_or_none(user)
        StockMovement.objects.create(
            part_number=source.part_number,
            movement_type=StockMovement.MovementType.OUTGOING,
            quantity=quantity,
            warehouse=source.warehouse,
            location=source.location,
            description=f"棚番移動: {target_warehouse} の {target_location} へ",
            operator=operator,
        )
        StockMovement.objects.create(
            part_number=source.part_number,
            movement_type=StockMovement.MovementType.INCOMING,
            quantity=quantity,
            warehouse=target_warehouse,
            location=target_location,
            description=f"棚番移動: {source.warehouse} の {source.location} から",
            operator=operator,
        )


def adjust_inventory(inventory_pk, new_quantity, new_location, user):
    """在庫数量(と棚番)を直接調整し、差分を入庫/出庫として履歴に記録する。"""
    with transaction.atomic():
        inventory = Inventory.objects.select_for_update().get(pk=inventory_pk)

        if new_quantity < inventory.reserved:
            raise InventoryServiceError(
                f"調整後の数量({new_quantity})は引当済数量({inventory.reserved})以上である必要があります。"
            )

        old_quantity = inventory.quantity
        diff = new_quantity - old_quantity

        inventory.quantity = new_quantity
        if new_location is not None:
            inventory.location = new_location
        inventory.save()

        if diff != 0:
            StockMovement.objects.create(
                part_number=inventory.part_number,
                movement_type=(
                    StockMovement.MovementType.INCOMING if diff > 0 else StockMovement.MovementType.OUTGOING
                ),
                quantity=abs(diff),
                warehouse=inventory.warehouse,
                location=inventory.location,
                description=f"在庫調整: {old_quantity} -> {new_quantity}",
                operator=_operator_or_none(user),
            )


# --- 入庫 ---


def receive_purchase_order(purchase_order_id, received_quantity, warehouse, location, user):
    """
    発注に対する入庫処理。入庫実績の作成・在庫計上・入出庫履歴の記録・発注ステータス更新を行う。
    """
    if received_quantity <= 0:
        raise InventoryServiceError("入庫数量は正の整数である必要があります。")

    with transaction.atomic():
        try:
            po = PurchaseOrder.objects.select_for_update().get(pk=purchase_order_id)
        except (PurchaseOrder.DoesNotExist, ValueError, ValidationError):
            raise InventoryServiceError("指定された発注が見つかりません。", status_code=404) from None

        if po.status == PurchaseOrder.Status.CANCELED:
            raise InventoryServiceError(f"発注 {po.order_number} はキャンセルされているため入庫できません。")
        if po.quantity is None:
            raise InventoryServiceError("この発注には発注数量が設定されていないため、入庫処理ができません。")
        # 在庫計上には品番が必須
        if not po.part_number:
            raise InventoryServiceError("この発注には品番が設定されていないため、入庫処理（在庫計上）ができません。")

        remaining_quantity = po.quantity - po.received_quantity
        if received_quantity > remaining_quantity:
            raise InventoryServiceError(f"入庫数量が残数量({remaining_quantity})を超えています。")

        warehouse = warehouse or po.warehouse
        location = location or po.location or ""
        if not warehouse:
            raise InventoryServiceError("入庫倉庫が指定されていません。")
        if not Warehouse.objects.filter(warehouse_number=warehouse).exists():
            raise InventoryServiceError(f"入庫倉庫 '{warehouse}' が存在しません。")

        operator = _operator_or_none(user)
        Receipt.objects.create(
            purchase_order=po,
            received_quantity=received_quantity,
            received_date=timezone.now(),
            warehouse=warehouse,
            location=location,
            operator=operator,
        )

        inventory = get_or_create_locked_inventory(po.part_number, warehouse, location)
        inventory.quantity += received_quantity
        inventory.save()

        StockMovement.objects.create(
            part_number=po.part_number,
            movement_type=StockMovement.MovementType.INCOMING,
            quantity=received_quantity,
            warehouse=warehouse,
            location=location,
            reference_document=f"PO: {po.order_number}",
            description=f"発注番号 {po.order_number} の入庫",
            operator=operator,
        )

        po.received_quantity += received_quantity
        if po.received_quantity >= po.quantity:
            po.status = PurchaseOrder.Status.FULLY_RECEIVED
        else:
            po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
        po.save()
        return po


# --- 入庫予定の一括登録・更新(外部連携) ---

PURCHASE_ORDER_BULK_UPSERT_MAX = 500

# 一括登録・更新で変更できるステータス(キャンセルとキャンセル取り消しのみ。入庫系は process-receipt で扱う)
BULK_UPSERT_STATUSES = (PurchaseOrder.Status.CANCELED, PurchaseOrder.Status.PENDING)


class _RowError(Exception):
    def __init__(self, body):
        super().__init__(body.get("error"))
        self.body = body


def _field_error(field, message):
    return _RowError({"error": message, "errors": {field: [message]}})


def _apply_bulk_status(po, new_status):
    """キャンセル/キャンセル取り消しを反映する。変更がなければ何もしない。"""
    if new_status == PurchaseOrder.Status.CANCELED:
        if po.status == PurchaseOrder.Status.CANCELED:
            return
        if po.received_quantity > 0:
            raise _field_error("status", f"発注 {po.order_number} は入庫済数量があるためキャンセルできません。")
        po.status = PurchaseOrder.Status.CANCELED
        po.save(update_fields=["status"])
    elif po.status == PurchaseOrder.Status.CANCELED:
        # キャンセル取り消し。通常は入庫済数量0なので未入庫に戻るが、管理画面等で入庫後にキャンセルされた場合も考慮する
        if po.received_quantity <= 0:
            po.status = PurchaseOrder.Status.PENDING
        elif po.quantity is not None and po.received_quantity >= po.quantity:
            po.status = PurchaseOrder.Status.FULLY_RECEIVED
        else:
            po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED
        po.save(update_fields=["status"])
    # キャンセルされていない入庫予定への pending 指定は、入庫の進捗を巻き戻さないよう無視する


def _upsert_purchase_order_row(row):
    """1件分の登録・更新。成功時は (結果種別, 入庫予定) を返し、失敗時は _RowError を送出する。"""
    if not isinstance(row, dict):
        raise _RowError({"error": "各要素はオブジェクトである必要があります。"})
    order_number = row.get("order_number")
    if not isinstance(order_number, str) or not order_number.strip():
        raise _field_error("order_number", "発注番号は必須です。")
    order_number = order_number.strip()
    allow_create = row.get("allow_create") is True
    new_status = row.get("status")
    if new_status is not None and new_status not in BULK_UPSERT_STATUSES:
        raise _field_error("status", "ステータスに指定できるのは canceled または pending のみです。")

    data = {key: value for key, value in row.items() if key not in ("allow_create", "status")}
    data["order_number"] = order_number

    with transaction.atomic():
        po = PurchaseOrder.objects.select_for_update().filter(order_number=order_number).first()
        if po is None:
            if not allow_create:
                raise _field_error("order_number", f"発注番号 {order_number} の入庫予定が見つかりません。")
            serializer = PurchaseOrderSerializer(data=data)
            result = "created"
        else:
            # 送られた項目だけを更新する(省略した項目は今の値を残す)
            serializer = PurchaseOrderSerializer(po, data=data, partial=True)
            result = "updated"
        if not serializer.is_valid():
            raise _RowError(validation_error_body(serializer.errors))
        po = serializer.save()
        if new_status is not None:
            _apply_bulk_status(po, new_status)
    return result, po


def bulk_upsert_purchase_orders(rows):
    """
    入庫予定を発注番号をキーに一括で登録・更新する。
    1件ずつ別のトランザクションで反映し、失敗した件があってもほかの件は取り消さない。
    新規登録は allow_create=true の行だけ行う。結果は送られた順に1件ずつ返す。
    """
    results = []
    for index, row in enumerate(rows):
        order_number = row.get("order_number") if isinstance(row, dict) else None
        entry = {"index": index, "order_number": order_number}
        try:
            result, po = _upsert_purchase_order_row(row)
        except _RowError as exc:
            entry.update(result="error", **exc.body)
        except IntegrityError:
            # 同じ発注番号の同時登録など
            entry.update(result="error", error="発注番号が重複しているため登録できませんでした。")
        except Exception:
            logger.exception("入庫予定の一括登録・更新で想定外のエラー(発注番号: %s)", order_number)
            entry.update(result="error", error=INTERNAL_ERROR_MESSAGE)
        else:
            entry.update(result=result, id=str(po.id), status=po.status)
        results.append(entry)
    return results


# --- 受注の引当・出庫 ---


def _reserved_prefix_error():
    return InventoryServiceError(
        f"'{SalesOrder.INTERNAL_ORDER_PREFIX}' で始まる受注番号は生産計画の材料引当用に予約されています。"
    )


def internal_order_error(sales_order):
    return InventoryServiceError(
        f"受注 {sales_order.order_number} は生産計画の材料引当用の内部受注のため、"
        "ここでは変更・出庫できません。材料引当画面から操作してください。"
    )


def _parse_allocation_item(alloc_item_data):
    part_number = alloc_item_data.get("part_number")
    warehouse = alloc_item_data.get("warehouse")
    quantity = alloc_item_data.get("quantity_to_reserve")
    if not part_number or not warehouse or quantity is None:
        raise InventoryServiceError(f"引当データが不正です: {alloc_item_data}")
    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        raise InventoryServiceError(f"引当数量が不正です: {alloc_item_data}") from None
    if quantity <= 0:
        raise InventoryServiceError(f"引当数量は1以上である必要があります: {alloc_item_data}")
    return part_number, warehouse, quantity


def allocate_sales_order(sales_order_ref, allocations_data):
    """
    受注に対して在庫を引き当てる(Inventory.reserved を加算し、受注が無ければ作成する)。
    同一品番+倉庫で棚をまたいで在庫が分散している場合は、入庫が古い順に複数の棚から引き当てる。
    """
    if not sales_order_ref or not isinstance(allocations_data, list) or not allocations_data:
        raise InventoryServiceError("sales_order_reference と allocations(1件以上)は必須です。")
    if str(sales_order_ref).startswith(SalesOrder.INTERNAL_ORDER_PREFIX):
        raise _reserved_prefix_error()

    summary = []
    sales_order = None
    with transaction.atomic():
        for alloc_item_data in allocations_data:
            part_number, warehouse, quantity_to_reserve = _parse_allocation_item(alloc_item_data)

            inventory_rows = lock_inventory_rows(part_number, warehouse)
            if not inventory_rows:
                raise InventoryServiceError(f"在庫が見つかりません: 品番'{part_number}' 倉庫'{warehouse}'。")

            eligible_rows = [row for row in inventory_rows if row.is_active and row.is_allocatable]
            if not eligible_rows:
                raise InventoryServiceError(
                    f"在庫が有効または引当可能ではありません: 品番'{part_number}' 倉庫'{warehouse}'。"
                )

            total_available = sum(row.available_quantity for row in eligible_rows)
            if total_available < quantity_to_reserve:
                raise InventoryServiceError(
                    f"利用可能在庫が不足しています: 品番'{part_number}' 倉庫'{warehouse}'。"
                    f"必要数: {quantity_to_reserve}, 利用可能: {total_available}"
                )

            locations_consumed = reserve_fifo(eligible_rows, quantity_to_reserve)

            sales_order, so_created = SalesOrder.objects.select_for_update().get_or_create(
                order_number=sales_order_ref,
                defaults={
                    "item": part_number,
                    "quantity": quantity_to_reserve,
                    "warehouse": warehouse,
                    "status": SalesOrder.Status.PENDING,
                },
            )
            if not so_created and (sales_order.item != part_number or sales_order.warehouse != warehouse):
                raise InventoryServiceError(
                    f"受注 '{sales_order_ref}' は既に異なる品目/倉庫で存在します。"
                    f"既存: 品目='{sales_order.item}', 倉庫='{sales_order.warehouse}'。"
                    f"今回: 品目='{part_number}', 倉庫='{warehouse}'。"
                )
            if sales_order.status != SalesOrder.Status.PENDING:
                raise InventoryServiceError(
                    f"受注 '{sales_order_ref}' は出庫済みまたはキャンセル済みのため引当できません。"
                )

            # 受注ごとの引当数量を記録する(出庫時に自身の引当分だけを解放するため)。
            # 既存受注への追加引当で出庫予定数量を超える場合は、出庫予定数量を引当に合わせて拡張する。
            sales_order.reserved_quantity = (0 if so_created else sales_order.reserved_quantity) + quantity_to_reserve
            sales_order.quantity = max(
                sales_order.quantity, sales_order.shipped_quantity + sales_order.reserved_quantity
            )
            sales_order.save()

            summary.append(
                {
                    "part_number": part_number,
                    "warehouse": warehouse,
                    "reserved_quantity": quantity_to_reserve,
                    "sales_order_created": so_created,
                    "locations_consumed": locations_consumed,
                    "new_total_reserved": sum(row.reserved for row in inventory_rows),
                    "new_available_quantity": sum(row.available_quantity for row in inventory_rows),
                }
            )
    return sales_order, summary


def issue_sales_order(order_id, quantity_to_ship, user):
    """
    受注に対する出庫。物理在庫を入庫が古い順に消費し、この受注自身の引当分のみを解放する。
    他の受注・材料引当が確保している在庫は出庫できない。
    """
    if quantity_to_ship <= 0:
        raise InventoryServiceError("出庫数量は0より大きい必要があります。")

    with transaction.atomic():
        try:
            sales_order = SalesOrder.objects.select_for_update().get(id=order_id)
        except (SalesOrder.DoesNotExist, ValueError, ValidationError):
            raise InventoryServiceError(f"受注ID {order_id} が見つかりません。", status_code=404) from None

        if sales_order.is_internal:
            raise internal_order_error(sales_order)
        if sales_order.status == SalesOrder.Status.SHIPPED:
            raise InventoryServiceError(f"受注 {sales_order.order_number} は既に出庫済みです。")
        if sales_order.status == SalesOrder.Status.CANCELED:
            raise InventoryServiceError(f"受注 {sales_order.order_number} はキャンセルされています。")
        if not sales_order.item or not sales_order.warehouse:
            raise InventoryServiceError(f"受注 {sales_order.order_number} に品目または倉庫が指定されていません。")
        if quantity_to_ship > sales_order.remaining_quantity:
            raise InventoryServiceError(
                f"出庫数量 ({quantity_to_ship}) が残数量 ({sales_order.remaining_quantity}) を超えています。"
            )

        inventory_rows = lock_inventory_rows(sales_order.item, sales_order.warehouse)
        if not inventory_rows:
            raise InventoryServiceError(
                f"在庫記録が見つかりません: 品目 {sales_order.item}、"
                f"倉庫 {sales_order.warehouse} (受注: {sales_order.order_number})",
                status_code=404,
            )

        # issue は allocate と異なり is_allocatable は確認しない(意図的な非対称性、
        # docs/09_test_specifications/01_inventory.md の既知の懸念事項3を参照)。
        eligible_rows = [row for row in inventory_rows if row.is_active]
        if not eligible_rows:
            raise InventoryServiceError(
                f"在庫品目 {sales_order.item} (倉庫: {sales_order.warehouse}) は有効ではありません。"
            )

        # 他の受注・材料引当が確保している在庫は出庫できない。出庫する棚(物理在庫の消費元)と
        # 引当を解放する棚は必ずしも一致しないため、consume_stock が棚間で引当を付け替える。
        try:
            consumed, released = consume_stock(eligible_rows, quantity_to_ship, sales_order.reserved_quantity)
        except InventoryServiceError as e:
            raise InventoryServiceError(
                f"在庫不足: {sales_order.item} (倉庫: {sales_order.warehouse})。{e.message}"
            ) from None

        operator = _operator_or_none(user)
        for row, take in consumed:
            StockMovement.objects.create(
                part_number=sales_order.item,
                movement_type=StockMovement.MovementType.OUTGOING,
                quantity=take,
                warehouse=sales_order.warehouse,
                location=row.location,
                reference_document=f"SO: {sales_order.order_number}",
                description=f"受注 {sales_order.order_number} による出庫",
                operator=operator,
            )

        sales_order.reserved_quantity -= released
        sales_order.shipped_quantity += quantity_to_ship
        if sales_order.remaining_quantity <= 0:
            sales_order.status = SalesOrder.Status.SHIPPED
        sales_order.save()
        return sales_order


def delete_sales_order(sales_order_pk):
    """受注を削除し、受注が持っていた引当を在庫側からも解放する。"""
    with transaction.atomic():
        sales_order = SalesOrder.objects.select_for_update().get(pk=sales_order_pk)
        if sales_order.is_internal:
            raise internal_order_error(sales_order)
        if sales_order.reserved_quantity > 0:
            rows = lock_inventory_rows(sales_order.item, sales_order.warehouse)
            release_reserved_fifo(rows, sales_order.reserved_quantity)
            save_rows(rows)
        sales_order.delete()
