from decimal import Decimal, InvalidOperation

from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.responses import error_response
from base.viewsets import CustomSuccessMessageMixin

from .bom import BomCycleError, explode_bom
from .models import (  # master.models を直接参照
    BillOfMaterial,
    Customer,
    Item,
    StockPurpose,
    Supplier,
    UnitCost,
    Warehouse,
    WarehouseLocation,
    WorkCalendarDay,
    WorkCalendarSetting,
    WorkCenter,
)
from .serializers import (
    BillOfMaterialCreateUpdateSerializer,
    BillOfMaterialSerializer,
    CustomerCreateUpdateSerializer,
    CustomerSerializer,
    ItemCreateUpdateSerializer,
    ItemSerializer,
    StockPurposeSerializer,
    SupplierCreateUpdateSerializer,
    SupplierSerializer,
    UnitCostCreateUpdateSerializer,
    UnitCostSerializer,
    WarehouseCreateUpdateSerializer,
    WarehouseLocationCreateUpdateSerializer,
    WarehouseLocationSerializer,
    WarehouseSerializer,
    WorkCalendarDaySerializer,
    WorkCalendarSettingSerializer,
    WorkCenterCreateUpdateSerializer,
    WorkCenterSerializer,
)


class ItemViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = Item.objects.all().order_by("code")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return ItemSerializer
        return ItemCreateUpdateSerializer


class SupplierViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("supplier_number")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return SupplierSerializer
        return SupplierCreateUpdateSerializer


class WarehouseViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = Warehouse.objects.all().order_by("warehouse_number")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return WarehouseSerializer
        return WarehouseCreateUpdateSerializer


class StockPurposeViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    """在庫用途マスター。使用中(在庫・入庫予定から参照されている)用途は削除できない(PROTECT)。"""

    queryset = StockPurpose.objects.all().order_by("code")
    serializer_class = StockPurposeSerializer
    permission_classes = [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return error_response("この用途は在庫で使用されているため削除できません。無効にしてください。")


class WarehouseLocationViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = WarehouseLocation.objects.all().select_related("warehouse").order_by("warehouse__warehouse_number", "code")
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = self.queryset
        warehouse = self.request.query_params.get("warehouse")
        if warehouse:
            queryset = queryset.filter(warehouse__warehouse_number=warehouse)
        return queryset

    def get_serializer_class(self):
        if self.action in ["list"]:
            return WarehouseLocationSerializer
        return WarehouseLocationCreateUpdateSerializer


class CustomerViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("code")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return CustomerSerializer
        return CustomerCreateUpdateSerializer


class WorkCenterViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = WorkCenter.objects.all().order_by("code")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return WorkCenterSerializer
        return WorkCenterCreateUpdateSerializer


class UnitCostViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = UnitCost.objects.all().select_related("item").order_by("item__code")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return UnitCostSerializer
        return UnitCostCreateUpdateSerializer


class BillOfMaterialViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    queryset = BillOfMaterial.objects.all().select_related("product", "material").order_by(
        "product__code", "material__code"
    )
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["list"]:
            return BillOfMaterialSerializer
        return BillOfMaterialCreateUpdateSerializer

    @action(detail=False, methods=["get"])
    def explode(self, request):
        """
        多階層BOMの展開。GET bill-of-materials/explode/?product=<品目コード>&quantity=<数量(省略時1)>
        """
        product_code = request.query_params.get("product")
        if not product_code:
            return error_response("product は必須です。")
        product = Item.objects.filter(code=product_code).first()
        if product is None:
            return error_response(f"品目 {product_code} は存在しません。", status.HTTP_404_NOT_FOUND)
        try:
            quantity = Decimal(request.query_params.get("quantity") or "1")
        except InvalidOperation:
            return error_response("quantity は数値で指定してください。")
        if quantity <= 0:
            return error_response("quantity は0より大きい値を指定してください。")
        try:
            result = explode_bom(product.code, quantity)
        except BomCycleError as e:
            return error_response(str(e))
        return Response(
            {"data": {"item_code": product.code, "item_name": product.name, "quantity": str(quantity), **result}}
        )


class WorkCalendarDayViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    """稼働日カレンダーの例外日(休業日・特別稼働日)。?year=&month= または ?from=&to= で期間を絞れる。"""

    queryset = WorkCalendarDay.objects.all().order_by("date")
    serializer_class = WorkCalendarDaySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = self.queryset
        params = self.request.query_params
        if params.get("year"):
            queryset = queryset.filter(date__year=params["year"])
        if params.get("month"):
            queryset = queryset.filter(date__month=params["month"])
        if params.get("from"):
            queryset = queryset.filter(date__gte=params["from"])
        if params.get("to"):
            queryset = queryset.filter(date__lte=params["to"])
        return queryset


class WorkCalendarSettingView(APIView):
    """曜日ごとの基本稼働パターン(単一設定)。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": WorkCalendarSettingSerializer(WorkCalendarSetting.load()).data})

    def put(self, request):
        serializer = WorkCalendarSettingSerializer(WorkCalendarSetting.load(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"message": "曜日ごとの稼働設定を更新しました。", "data": serializer.data})

    patch = put
