from django.db import IntegrityError, models
from django.db.models import (
    F,
    ProtectedError,
    Q,
    Sum,
)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import (
    PageNumberPagination,  # PageNumberPagination は StandardResultsSetPagination で使用
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from master.models import WarehouseLocation

from . import services
from .models import (
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


class ReceiptViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """
    API endpoint that allows receipts to be viewed or edited.
    入庫実績の作成は在庫計上と連動する purchase-orders/process-receipt/ でのみ行い、
    削除は在庫との整合性が崩れるため提供しない(更新は備考のみ)。
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

    def destroy(self, request, *args, **kwargs):
        inventory = self.get_object()
        if inventory.quantity > 0 or inventory.reserved > 0:
            # 在庫数や引当が残ったまま削除すると入出庫履歴なしに在庫が消えるため、先に在庫調整で0にさせる
            return Response(
                {
                    "error": (
                        "在庫数または引当済数量が0でない在庫は削除できません。"
                        "在庫調整で0にしてから削除してください。"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="by-location")
    def by_location(self, request):
        warehouse = request.query_params.get("warehouse")
        location = request.query_params.get("location")

        if not warehouse or location is None:
            return Response(
                {"success": False, "error": "倉庫(warehouse)と棚番(location)は必須のクエリパラメータです。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inventory_items = Inventory.objects.filter(
            warehouse_rel__warehouse_number=warehouse, location=location, quantity__gt=0
        ).order_by("part_number_rel__code")

        serializer = self.get_serializer(inventory_items, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request, pk=None):
        source_inventory = self.get_object()
        try:
            quantity_to_move = int(request.data.get("quantity_to_move"))
        except (TypeError, ValueError):
            return Response(
                {"success": False, "error": "無効なリクエストデータです。"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            services.move_inventory(
                source_inventory.pk,
                quantity_to_move,
                request.data.get("target_warehouse"),
                request.data.get("target_location"),
                request.user,
            )
        except services.InventoryServiceError as e:
            return Response({"success": False, "error": e.message}, status=e.status_code)
        except IntegrityError:
            return Response(
                {
                    "success": False,
                    "error": "移動先の品番/倉庫/棚番の組み合わせが既に別の在庫レコードとして存在します。",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"success": True, "message": "在庫を正常に移動しました。"})

    @action(detail=True, methods=["post"], url_path="adjust")
    def adjust(self, request, pk=None):
        """
        在庫数量や棚番を直接調整します。
        """
        inventory = self.get_object()
        new_quantity = request.data.get("quantity")
        if new_quantity is None:
            return Response({"error": "数量は必須です。"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            new_quantity = int(new_quantity)
        except (TypeError, ValueError):
            return Response({"error": "数量は数値である必要があります。"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            services.adjust_inventory(inventory.pk, new_quantity, request.data.get("location"), request.user)
        except services.InventoryServiceError as e:
            return Response({"error": e.message}, status=e.status_code)
        except IntegrityError:
            return Response(
                {"error": "移動先の品番/倉庫/棚番の組み合わせが既に別の在庫レコードとして存在します。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"success": True, "message": "在庫を正常に調整しました。"})


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
                filters &= Q(status__in=[PurchaseOrder.Status.PARTIALLY_RECEIVED, PurchaseOrder.Status.FULLY_RECEIVED])
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
        if not all([purchase_order_id, received_quantity_str]):
            return Response({"error": "必須項目が不足しています。"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            received_quantity = int(received_quantity_str)
        except (ValueError, TypeError):
            return Response({"error": "入庫数量は正の整数である必要があります。"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            po = services.receive_purchase_order(
                purchase_order_id,
                received_quantity,
                str(request.data.get("warehouse") or "").strip(),
                str(request.data.get("location") or "").strip(),
                request.user,
            )
        except services.InventoryServiceError as e:
            return Response({"error": e.message}, status=e.status_code)
        return Response(
            {
                "success": True,
                "message": f"発注 {po.order_number} の入庫処理が正常に完了しました。",
                "order_number": po.order_number,
            },
            status=status.HTTP_200_OK,
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

        queryset = SalesOrder.objects.filter(filters)
        # 出庫画面向け: 材料引当用の内部受注は出庫APIの対象外のため一覧から除外できるようにする
        if self.request.query_params.get("exclude_internal", "false").lower() == "true":
            queryset = queryset.exclude(order_number__startswith=SalesOrder.INTERNAL_ORDER_PREFIX)

        return queryset.select_related("item_rel", "warehouse_rel").order_by("expected_shipment", "order_number")

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_internal:
            return Response(
                {"success": False, "error": services.internal_order_error(instance).message},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            services.delete_sales_order(instance.pk)
        except services.InventoryServiceError as e:
            return Response({"success": False, "error": e.message}, status=e.status_code)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="location-map")
    def location_map(self, request, pk=None):
        """
        受注品目の在庫がある棚をハイライトするための、倉庫レイアウト情報を返します。
        ロケーションの対応付けは WarehouseLocation.code と Inventory.location の文字列一致で行う。
        """
        order = self.get_object()
        warehouse = order.warehouse_rel
        if warehouse is None:
            return Response(
                {"status": "error", "message": f"受注 {order.order_number} に出庫倉庫が設定されていません。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
        try:
            sales_order, summary = services.allocate_sales_order(
                request.data.get("sales_order_reference"), request.data.get("allocations")
            )
        except services.InventoryServiceError as e:
            return Response({"success": False, "error": e.message}, status=e.status_code)
        return Response(
            {
                "success": True,
                "message": "在庫を正常に引き当てました。",
                "sales_order_reference": sales_order.order_number,
                "sales_order_id": sales_order.id,
                "allocations_summary": summary,
            },
            status=status.HTTP_200_OK,
        )

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
        except (TypeError, ValueError):
            return Response(
                {"success": False, "error": "出庫数量は有効な数値である必要があります。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sales_order = services.issue_sales_order(order_id, quantity_to_ship, request.user)
        except services.InventoryServiceError as e:
            return Response({"success": False, "error": e.message}, status=e.status_code)
        return Response(
            {
                "success": True,
                "message": (
                    f"受注 {sales_order.order_number} から {quantity_to_ship} 個の {sales_order.item} を出庫しました。"
                ),
            }
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

        return (
            StockMovement.objects.filter(filters)
            .select_related("part_number_rel", "warehouse_rel")
            .order_by("-movement_date", "part_number_rel__code")
        )
