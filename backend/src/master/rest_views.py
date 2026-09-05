from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (  # master.models を直接参照
    BillOfMaterial,
    Customer,
    Item,
    Supplier,
    UnitCost,
    Warehouse,
    WarehouseLocation,
    WorkCenter,
)
from .serializers import (
    BillOfMaterialCreateUpdateSerializer,
    BillOfMaterialSerializer,
    CustomerCreateUpdateSerializer,
    CustomerSerializer,
    ItemCreateUpdateSerializer,
    ItemSerializer,
    SupplierCreateUpdateSerializer,
    SupplierSerializer,
    UnitCostCreateUpdateSerializer,
    UnitCostSerializer,
    WarehouseCreateUpdateSerializer,
    WarehouseLocationCreateUpdateSerializer,
    WarehouseLocationSerializer,
    WarehouseSerializer,
    WorkCenterCreateUpdateSerializer,
    WorkCenterSerializer,
)


class CustomSuccessMessageMixin:
    """
    Mixin to customize success messages for create, update, and destroy actions,
    and to format list/retrieve responses to match frontend expectations.
    """

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response({"status": "success", "data": serializer.data})

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({"status": "success", "data": serializer.data})  # Ensure consistent response structure

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        model_name = self.queryset.model._meta.verbose_name
        return Response(
            {"status": "success", "message": f"{model_name}を登録しました。", "data": serializer.data},
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)  # Default to PATCH
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        model_name = self.queryset.model._meta.verbose_name
        return Response(
            {"status": "success", "message": f"{model_name}を更新しました。", "data": serializer.data},
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        model_name = self.queryset.model._meta.verbose_name
        instance_repr = str(instance)
        try:
            self.perform_destroy(instance)
            return Response(
                {"status": "success", "message": f"{model_name}「{instance_repr}」を削除しました。"},
                status=status.HTTP_200_OK,
            )
        except ProtectedError:
            return Response(
                {
                    "status": "error",
                    "message": (
                        f"この{model_name}は他で使用されているため削除できません。関連データを確認してください。"
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
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
