from datetime import datetime

from django.db import (  # トランザクションのためにインポート # Qオブジェクトをインポートして複雑なクエリを構築
    IntegrityError,
    models,
    transaction,
)
from django.db.models import (
    F,
    ProtectedError,
    Q,
    Sum,
)
from django.http import Http404
from django.shortcuts import get_object_or_404  # オブジェクト取得のためにインポート
from master.models import WarehouseLocation
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import (
    PageNumberPagination,  # PageNumberPagination は StandardResultsSetPagination で使用
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (  # SalesOrder, Receiptモデルをインポート
    Inventory,
    PurchaseOrder,
    Receipt,
    SalesOrder,
    StockMovement,
)
from .serializers import (
    InventorySerializer,
    PurchaseOrderSerializer,
    ReceiptSerializer,
    SalesOrderSerializer,
    StockMovementSerializer,
)


# DRFのページネーションクラスを定義 (共通で利用可能)
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25  # 1ページあたりのデフォルト件数を25に変更（適宜調整してください）
    page_size_query_param = "page_size"  # クライアントが1ページあたりの件数を指定するためのクエリパラメータ
    max_page_size = 1000  # クライアントが指定できる1ページあたりの最大件数

    def get_paginated_response(self, data):
        return Response(
            {
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "count": self.page.paginator.count,
                "total_pages": self.page.paginator.num_pages,
                "current_page": self.page.number,
                "page_size": self.get_page_size(self.request),
                "results": data,
            }
        )


# --- ViewSets ---


class ReceiptViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows receipts to be viewed or edited.
    """

    queryset = Receipt.objects.all().select_related("purchase_order", "operator").order_by("-received_date")
    serializer_class = ReceiptSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]


class InventoryViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows inventory to be viewed or edited.
    """

    serializer_class = InventorySerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        part_number_query = self.request.query_params.get("part_number_query", None)
        warehouse_query = self.request.query_params.get("warehouse_query", None)
        location_query = self.request.query_params.get("location_query", None)
        hide_zero_stock_query = self.request.query_params.get("hide_zero_stock_query", "false").lower() == "true"

        filters = Q()
        if part_number_query:
            filters &= Q(part_number_rel__code__icontains=part_number_query)
        if warehouse_query:
            filters &= Q(warehouse_rel__warehouse_number__icontains=warehouse_query)
        if location_query:
            filters &= Q(location__icontains=location_query)

        queryset = Inventory.objects.filter(filters).select_related("part_number_rel", "warehouse_rel")

        if hide_zero_stock_query:
            queryset = queryset.filter(is_active=True, is_allocatable=True, quantity__gt=F("reserved"))

        return queryset.order_by("part_number_rel__code", "warehouse_rel__warehouse_number", "location")

    @action(detail=False, methods=["get"], url_path="by-location")
    def by_location(self, request):
        warehouse = request.query_params.get("warehouse")
        location = request.query_params.get("location")

        if not warehouse or location is None:
            return Response(
                {"success": False, "error": "倉庫(warehouse)と棚番(location)は必須のクエリパラメータです。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inventory_items = Inventory.objects.filter(warehouse_rel__warehouse_number=warehouse, location=location, quantity__gt=0).order_by(
            "part_number_rel__code"
        )

        serializer = self.get_serializer(inventory_items, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request, pk=None):
        source_inventory = self.get_object()

        try:
            quantity_to_move = int(request.data.get("quantity_to_move"))
            target_warehouse = request.data.get("target_warehouse")
            target_location = request.data.get("target_location", "")  # location can be blank
        except (TypeError, ValueError):
            return Response(
                {"success": False, "error": "無効なリクエストデータです。"}, status=status.HTTP_400_BAD_REQUEST
            )

        if not target_warehouse:
            return Response({"success": False, "error": "移動先倉庫は必須です。"}, status=status.HTTP_400_BAD_REQUEST)

        if quantity_to_move <= 0:
            return Response(
                {"success": False, "error": "移動数量は1以上である必要があります。"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # 行ロックを取得した上で最新の状態を再取得する（同時実行によるロストアップデート防止）
                source_inventory = Inventory.objects.select_for_update().get(pk=source_inventory.pk)

                available_to_move = source_inventory.quantity - source_inventory.reserved
                if quantity_to_move > available_to_move:
                    return Response(
                        {
                            "success": False,
                            "error": f"移動数量が利用可能在庫数(引当済みを除く)を超えています。利用可能: {available_to_move}",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # 移動元から在庫を減らす
                source_inventory.quantity -= quantity_to_move
                source_inventory.save()

                # 移動先に在庫を追加または作成（行ロックを取得してからget_or_create相当の処理を行う）
                try:
                    target_inventory = Inventory.objects.select_for_update().get(
                        part_number_rel_id=source_inventory.part_number,
                        warehouse_rel_id=target_warehouse,
                        location=target_location,
                    )
                    target_inventory.quantity += quantity_to_move
                    target_inventory.save()
                except Inventory.DoesNotExist:
                    Inventory.objects.create(
                        part_number=source_inventory.part_number,
                        warehouse=target_warehouse,
                        location=target_location,
                        quantity=quantity_to_move,
                    )

                # 在庫移動履歴を記録
                operator = request.user if request.user.is_authenticated else None

                # 移動元の履歴 (出庫)
                StockMovement.objects.create(
                    part_number=source_inventory.part_number,
                    movement_type="outgoing",
                    quantity=quantity_to_move,
                    warehouse=source_inventory.warehouse,
                    location=source_inventory.location,
                    description=f"棚番移動: {target_warehouse} の {target_location} へ",
                    operator=operator,
                )

                # 移動先の履歴 (入庫)
                StockMovement.objects.create(
                    part_number=source_inventory.part_number,
                    movement_type="incoming",
                    quantity=quantity_to_move,
                    warehouse=target_warehouse,
                    location=target_location,
                    description=f"棚番移動: {source_inventory.warehouse} の {source_inventory.location} から",
                    operator=operator,
                )

            return Response({"success": True, "message": "在庫を正常に移動しました。"})

        except IntegrityError:
            return Response(
                {"success": False, "error": "移動先の品番/倉庫/棚番の組み合わせが既に別の在庫レコードとして存在します。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"success": False, "error": f"在庫移動中にエラーが発生しました: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"], url_path="adjust")
    def adjust(self, request, pk=None):
        """
        在庫数量や棚番を直接調整します。
        """
        inventory = self.get_object()
        new_quantity = request.data.get("quantity")
        new_location = request.data.get("location")

        if new_quantity is None:
            return Response({"error": "数量は必須です。"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_quantity = int(new_quantity)
        except ValueError:
            return Response({"error": "数量は数値である必要があります。"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # 行ロックを取得した上で最新の状態を再取得する（同時実行によるロストアップデート防止）
                inventory = Inventory.objects.select_for_update().get(pk=inventory.pk)

                if new_quantity < inventory.reserved:
                    return Response(
                        {
                            "error": (
                                f"調整後の数量({new_quantity})は引当済数量({inventory.reserved})"
                                "以上である必要があります。"
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                old_quantity = inventory.quantity
                diff = new_quantity - old_quantity

                inventory.quantity = new_quantity
                if new_location is not None:
                    inventory.location = new_location
                inventory.save()

                if diff != 0:
                    movement_type = "incoming" if diff > 0 else "outgoing"
                    StockMovement.objects.create(
                        part_number=inventory.part_number,
                        movement_type=movement_type,
                        quantity=abs(diff),
                        warehouse=inventory.warehouse,
                        location=inventory.location,
                        description=f"在庫調整: {old_quantity} -> {new_quantity}",
                        operator=request.user if request.user.is_authenticated else None,
                    )

            return Response({"success": True, "message": "在庫を正常に調整しました。"})
        except IntegrityError:
            return Response(
                {"error": "移動先の品番/倉庫/棚番の組み合わせが既に別の在庫レコードとして存在します。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"error": f"在庫調整中にエラーが発生しました: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows purchase orders to be viewed or edited.
    """

    serializer_class = PurchaseOrderSerializer
    pagination_class = StandardResultsSetPagination

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"error": "この発注は入庫実績が関連付けられているため削除できません。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        filters = Q()
        search_params_text = {
            "search_order_number": "order_number__icontains",
            "search_shipment_number": "shipment_number__icontains",
            "search_supplier": "supplier_rel__name__icontains",
            "search_part_number": "part_number_rel__code__icontains",
            "search_warehouse": "warehouse_rel__warehouse_number__icontains",
        }
        for param, field_lookup in search_params_text.items():
            value = self.request.query_params.get(param)
            if value:
                filters &= Q(**{field_lookup: value})

        # Add a general search parameter 'search_q' for mobile view
        search_q = self.request.query_params.get("search_q")
        if search_q:
            filters &= (
                Q(order_number__icontains=search_q)
                | Q(part_number_rel__code__icontains=search_q)
                | Q(product_name__icontains=search_q)
                | Q(supplier_rel__name__icontains=search_q)
                | Q(item__icontains=search_q)
            )

        search_item_product_name = self.request.query_params.get("search_item_product_name")
        if search_item_product_name:
            filters &= Q(item__icontains=search_item_product_name) | Q(product_name__icontains=search_item_product_name)

        search_status = self.request.query_params.get("search_status")
        if search_status:
            # フロントエンドから 'received' が来た場合、両方の入庫済みステータスを検索対象とする
            if search_status == "received":
                filters &= Q(status__in=["partially_received", "fully_received"])
            else:
                filters &= Q(status=search_status)

        date_filters_map = {
            "search_order_date_from": "order_date__date__gte",
            "search_order_date_to": "order_date__date__lte",
            "search_expected_arrival_from": "expected_arrival__date__gte",
            "search_expected_arrival_to": "expected_arrival__date__lte",
        }
        for param, field_lookup in date_filters_map.items():
            value = self.request.query_params.get(param)
            if value:
                filters &= Q(**{field_lookup: value})

        return PurchaseOrder.objects.filter(filters).order_by(
            F("expected_arrival").asc(nulls_last=True), "order_number"
        )

    @action(detail=False, methods=["post"], url_path="process-receipt")
    def process_receipt(self, request):
        """
        指定された発注IDに基づいて入庫処理を行う。
        - Receipt（入庫実績）レコードを作成
        - Inventory（在庫）を更新
        - StockMovement（在庫移動履歴）を作成
        - PurchaseOrder（発注）のステータスを更新
        """
        purchase_order_id = request.data.get("purchase_order_id")
        received_quantity_str = request.data.get("received_quantity")
        location = request.data.get("location", "").strip()
        warehouse = request.data.get("warehouse", "").strip()
        operator = request.user

        if not all([purchase_order_id, received_quantity_str]):
            return Response({"error": "必須項目が不足しています。"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            received_quantity = int(received_quantity_str)
            if received_quantity <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"error": "入庫数量は正の整数である必要があります。"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                po = get_object_or_404(PurchaseOrder.objects.select_for_update(), pk=purchase_order_id)

                # 在庫計上には品番が必須なため、存在をチェックする
                if not po.part_number:
                    return Response(
                        {"error": "この発注には品番が設定されていないため、入庫処理（在庫計上）ができません。"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                remaining_quantity = po.quantity - po.received_quantity
                if received_quantity > remaining_quantity:
                    return Response(
                        {"error": f"入庫数量が残数量({remaining_quantity})を超えています。"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if not warehouse:
                    warehouse = po.warehouse
                if not location:
                    location = po.location
                if not warehouse:
                    return Response({"error": "入庫倉庫が指定されていません。"}, status=status.HTTP_400_BAD_REQUEST)

                # 1. Create Receipt
                Receipt.objects.create(
                    purchase_order=po,
                    received_quantity=received_quantity,
                    received_date=datetime.now(),
                    warehouse=warehouse,
                    location=location,
                    operator=operator,
                )

                # 2. Update/Create Inventory（行ロックを取得してから更新し、同時入庫によるロストアップデートを防止）
                try:
                    inventory = Inventory.objects.select_for_update().get(
                        part_number_rel_id=po.part_number, warehouse_rel_id=warehouse, location=location
                    )
                    inventory.quantity += received_quantity
                    inventory.save()
                except Inventory.DoesNotExist:
                    Inventory.objects.create(
                        part_number=po.part_number,
                        warehouse=warehouse,
                        location=location,
                        quantity=received_quantity,
                    )

                # 3. Create Stock Movement
                StockMovement.objects.create(
                    part_number=po.part_number,
                    movement_type="incoming",
                    quantity=received_quantity,
                    warehouse=warehouse,
                    location=location,
                    reference_document=f"PO: {po.order_number}",
                    description=f"発注番号 {po.order_number} の入庫",
                    operator=operator,
                )

                # 4. Update Purchase Order status
                po.received_quantity += received_quantity
                po.save()
                po.refresh_from_db()

                if po.received_quantity >= po.quantity:
                    po.status = "fully_received"
                else:
                    po.status = "partially_received"
                po.save()

                return Response(
                    {
                        "success": True,
                        "message": f"発注 {po.order_number} の入庫処理が正常に完了しました。",
                        "order_number": po.order_number,
                    },
                    status=status.HTTP_200_OK,
                )

        except (PurchaseOrder.DoesNotExist, Http404):
            # get_object_or_404 は DoesNotExist/ValueError/TypeError を Http404 に変換して送出するため、
            # 両方を捕捉する。
            return Response({"error": "指定された発注が見つかりません。"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"処理中に予期せぬエラーが発生しました: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"], url_path="distinct-values")
    def distinct_values(self, request):
        """
        指定されたフィールドのユニークな値のリストを返します。
        CharFieldのみを対象とします。
        """
        field_name = request.query_params.get("field")

        # セキュリティ: CharField 型のフィールドのみを許可
        allowed_fields = [f.name for f in PurchaseOrder._meta.get_fields() if isinstance(f, models.CharField)]

        if not field_name or field_name not in allowed_fields:
            return Response({"error": "Invalid or missing field parameter."}, status=status.HTTP_400_BAD_REQUEST)

        # 空やNULLでない値のみを取得し、ソートする
        values = (
            PurchaseOrder.objects.filter(**{f"{field_name}__isnull": False})
            .exclude(**{f"{field_name}": ""})
            .values_list(field_name, flat=True)
            .distinct()
            .order_by(field_name)
        )

        return Response(list(values))


class SalesOrderViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows sales orders to be viewed or edited.
    """

    serializer_class = SalesOrderSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        filters = Q()
        search_order_number = self.request.query_params.get("search_order_number")
        if search_order_number:
            filters &= Q(order_number__icontains=search_order_number)

        search_item = self.request.query_params.get("search_item")
        if search_item:
            filters &= Q(item_rel__code__icontains=search_item)

        search_warehouse = self.request.query_params.get("search_warehouse")
        if search_warehouse:
            filters &= Q(warehouse_rel__warehouse_number__icontains=search_warehouse)

        search_status = self.request.query_params.get("search_status")
        if search_status:
            filters &= Q(status=search_status)

        return SalesOrder.objects.filter(filters).select_related("item_rel", "warehouse_rel").order_by("expected_shipment", "order_number")

    @action(detail=True, methods=["get"], url_path="location-map")
    def location_map(self, request, pk=None):
        """
        受注品目の在庫がある棚をハイライトするための、倉庫レイアウト情報を返します。
        ロケーションの対応付けは WarehouseLocation.code と Inventory.location の文字列一致で行う。
        """
        order = self.get_object()
        warehouse = order.warehouse_rel

        qty_by_location = {
            row["location"]: row["total_qty"]
            for row in Inventory.objects.filter(
                warehouse_rel=warehouse, part_number_rel=order.item_rel, quantity__gt=0
            )
            .values("location")
            .annotate(total_qty=Sum(F("quantity") - F("reserved")))
        }

        locations = [
            {
                "code": loc.code,
                "name": loc.name,
                "pos_x": loc.pos_x,
                "pos_y": loc.pos_y,
                "width": loc.width,
                "height": loc.height,
                "quantity": qty_by_location.get(loc.code, 0),
                "highlighted": loc.code in qty_by_location,
            }
            for loc in WarehouseLocation.objects.filter(warehouse__warehouse_number=warehouse.warehouse_number)
        ]

        return Response(
            {
                "status": "success",
                "data": {
                    "warehouse": {
                        "warehouse_number": warehouse.warehouse_number,
                        "name": warehouse.name,
                        "cols": warehouse.layout_cols,
                        "rows": warehouse.layout_rows,
                    },
                    "locations": locations,
                },
            }
        )

    @action(detail=False, methods=["post"])
    def allocate(self, request):
        """
        受注に対して在庫を引き当てます（reservedを増やし、SalesOrderを作成/検証します）。

        Request body:
        {
          "sales_order_reference": "SO12345",
          "allocations": [
            {"part_number": "PN001", "warehouse": "WH-A", "quantity_to_reserve": 10}
          ]
        }
        """
        sales_order_ref = request.data.get("sales_order_reference")
        allocations_data = request.data.get("allocations")

        if not sales_order_ref or not isinstance(allocations_data, list) or not allocations_data:
            return Response(
                {"success": False, "error": "sales_order_reference と allocations(1件以上)は必須です。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        processed_allocations_summary = []
        sales_order = None

        try:
            with transaction.atomic():
                for alloc_item_data in allocations_data:
                    part_number = alloc_item_data.get("part_number")
                    warehouse = alloc_item_data.get("warehouse")
                    quantity_to_reserve = alloc_item_data.get("quantity_to_reserve")

                    if not part_number or not warehouse or quantity_to_reserve is None:
                        raise ValueError(f"引当データが不正です: {alloc_item_data}")
                    try:
                        quantity_to_reserve = int(quantity_to_reserve)
                    except (TypeError, ValueError):
                        raise ValueError(f"引当数量が不正です: {alloc_item_data}")
                    if quantity_to_reserve <= 0:
                        raise ValueError(f"引当数量は1以上である必要があります: {alloc_item_data}")

                    # 同一品番+倉庫内で棚番(location)をまたいで在庫が分散しているケースに対応するため、
                    # 単一行の get() ではなく該当する全ロケーションを取得し、棚番の昇順で
                    # 必要数量に達するまで複数ロケーションから引き当てる。
                    inventory_rows = list(
                        Inventory.objects.select_for_update()
                        .filter(part_number_rel_id=part_number, warehouse_rel_id=warehouse)
                        .order_by("location")
                    )
                    if not inventory_rows:
                        raise ValueError(f"在庫が見つかりません: 品番'{part_number}' 倉庫'{warehouse}'。")

                    eligible_rows = [row for row in inventory_rows if row.is_active and row.is_allocatable]
                    if not eligible_rows:
                        raise ValueError(
                            f"在庫が有効または引当可能ではありません: 品番'{part_number}' 倉庫'{warehouse}'。"
                        )

                    total_available = sum(row.available_quantity for row in eligible_rows)
                    if total_available < quantity_to_reserve:
                        raise ValueError(
                            f"利用可能在庫が不足しています: 品番'{part_number}' 倉庫'{warehouse}'。"
                            f"必要数: {quantity_to_reserve}, 利用可能: {total_available}"
                        )

                    remaining_to_reserve = quantity_to_reserve
                    locations_consumed = []
                    for row in eligible_rows:
                        if remaining_to_reserve <= 0:
                            break
                        take = min(row.available_quantity, remaining_to_reserve)
                        if take <= 0:
                            continue
                        row.reserved += take
                        row.save()
                        remaining_to_reserve -= take
                        locations_consumed.append({"location": row.location, "reserved_quantity": take})

                    sales_order, so_created = SalesOrder.objects.get_or_create(
                        order_number=sales_order_ref,
                        defaults={
                            "item": part_number,
                            "quantity": quantity_to_reserve,
                            "warehouse": warehouse,
                            "status": "pending",
                        },
                    )

                    if not so_created and (sales_order.item != part_number or sales_order.warehouse != warehouse):
                        raise ValueError(
                            f"受注 '{sales_order_ref}' は既に異なる品目/倉庫で存在します。"
                            f"既存: 品目='{sales_order.item}', 倉庫='{sales_order.warehouse}'。"
                            f"今回: 品目='{part_number}', 倉庫='{warehouse}'。"
                        )

                    processed_allocations_summary.append(
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

            return Response(
                {
                    "success": True,
                    "message": "在庫を正常に引き当てました。",
                    "sales_order_reference": sales_order_ref,
                    "sales_order_id": sales_order.id if sales_order else None,
                    "allocations_summary": processed_allocations_summary,
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as e:
            return Response({"success": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"])
    def issue(self, request):
        """
        受注に対して出庫処理を行います（在庫と引当を消費し、受注を出庫済みにします）。

        Request body: {"order_id": "uuid", "quantity_to_ship": 10}
        """
        order_id = request.data.get("order_id")
        quantity_to_ship_str = request.data.get("quantity_to_ship")

        if not order_id or quantity_to_ship_str is None:
            return Response(
                {"success": False, "error": "order_id と quantity_to_ship は必須です。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            quantity_to_ship = int(quantity_to_ship_str)
            if quantity_to_ship <= 0:
                return Response(
                    {"success": False, "error": "出庫数量は0より大きい必要があります。"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except (TypeError, ValueError):
            return Response(
                {"success": False, "error": "出庫数量は有効な数値である必要があります。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                try:
                    sales_order = SalesOrder.objects.select_for_update().get(id=order_id)
                except SalesOrder.DoesNotExist:
                    return Response(
                        {"success": False, "error": f"受注ID {order_id} が見つかりません。"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                if sales_order.status == "shipped":
                    return Response(
                        {"success": False, "error": f"受注 {sales_order.order_number} は既に出庫済みです。"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if sales_order.status == "canceled":
                    return Response(
                        {"success": False, "error": f"受注 {sales_order.order_number} はキャンセルされています。"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not sales_order.item or not sales_order.warehouse:
                    return Response(
                        {
                            "success": False,
                            "error": f"受注 {sales_order.order_number} に品目または倉庫が指定されていません。",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if quantity_to_ship > sales_order.remaining_quantity:
                    return Response(
                        {
                            "success": False,
                            "error": (
                                f"出庫数量 ({quantity_to_ship}) が残数量 "
                                f"({sales_order.remaining_quantity}) を超えています。"
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # 同一品番+倉庫内で棚番(location)をまたいで在庫が分散しているケースに対応するため、
                # 単一行の get() ではなく該当する全ロケーションを取得し、棚番の昇順で
                # 出庫数量に達するまで複数ロケーションから出庫する。
                inventory_rows = list(
                    Inventory.objects.select_for_update()
                    .filter(part_number_rel_id=sales_order.item, warehouse_rel_id=sales_order.warehouse)
                    .order_by("location")
                )
                if not inventory_rows:
                    return Response(
                        {
                            "success": False,
                            "error": (
                                f"在庫記録が見つかりません: 品目 {sales_order.item}、"
                                f"倉庫 {sales_order.warehouse} (受注: {sales_order.order_number})"
                            ),
                        },
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # issue は allocate と異なり is_allocatable は確認しない(意図的な非対称性、
                # docs/09_test_specifications/01_inventory.md の既知の懸念事項2を参照)。
                eligible_rows = [row for row in inventory_rows if row.is_active]
                if not eligible_rows:
                    return Response(
                        {
                            "success": False,
                            "error": f"在庫品目 {sales_order.item} (倉庫: {sales_order.warehouse}) は有効ではありません。",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                total_quantity = sum(row.quantity for row in eligible_rows)
                if total_quantity < quantity_to_ship:
                    return Response(
                        {
                            "success": False,
                            "error": (
                                f"在庫不足: {sales_order.item} (倉庫: {sales_order.warehouse})。"
                                f"実在庫: {total_quantity}, 要求: {quantity_to_ship}。"
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                remaining_to_ship = quantity_to_ship
                operator = request.user if request.user.is_authenticated else None
                for row in eligible_rows:
                    if remaining_to_ship <= 0:
                        break
                    take = min(row.quantity, remaining_to_ship)
                    if take <= 0:
                        continue
                    row.quantity -= take
                    row.reserved -= min(row.reserved, take)
                    row.save()
                    remaining_to_ship -= take

                    StockMovement.objects.create(
                        part_number=sales_order.item,
                        movement_type="outgoing",
                        quantity=take,
                        warehouse=sales_order.warehouse,
                        location=row.location,
                        reference_document=f"SO: {sales_order.order_number}",
                        description=f"受注 {sales_order.order_number} による出庫",
                        operator=operator,
                    )

                sales_order.shipped_quantity += quantity_to_ship
                if sales_order.remaining_quantity <= 0:
                    sales_order.status = "shipped"
                sales_order.save()

                return Response(
                    {
                        "success": True,
                        "message": f"受注 {sales_order.order_number} から {quantity_to_ship} 個の {sales_order.item} を出庫しました。",
                    }
                )
        except Exception as e:
            return Response(
                {"success": False, "error": f"出庫処理中に予期せぬエラーが発生しました: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows stock movements to be viewed.
    """

    serializer_class = StockMovementSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        filters = Q()
        text_search_params = {
            "search_part_number": "part_number_rel__code__icontains",
            "search_warehouse": "warehouse_rel__warehouse_number__icontains",
            "search_reference_document": "reference_document__icontains",
            "search_description": "description__icontains",
            "search_operator": "operator__username__icontains",
        }
        for param, field_lookup in text_search_params.items():
            value = self.request.query_params.get(param)
            if value:
                filters &= Q(**{field_lookup: value})

        search_movement_types = self.request.query_params.getlist("search_movement_type")
        if search_movement_types:
            filters &= Q(movement_type__in=search_movement_types)

        search_quantity = self.request.query_params.get("search_quantity")
        if search_quantity:
            try:
                filters &= Q(quantity=int(search_quantity))
            except ValueError:
                pass

        date_from = self.request.query_params.get("search_movement_date_from")
        date_to = self.request.query_params.get("search_movement_date_to")
        if date_from:
            filters &= Q(movement_date__date__gte=date_from)
        if date_to:
            filters &= Q(movement_date__date__lte=date_to)

        return StockMovement.objects.filter(filters).select_related("part_number_rel", "warehouse_rel").order_by("-movement_date", "part_number_rel__code")
