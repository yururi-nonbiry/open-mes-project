from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from base.viewsets import CustomSuccessMessageMixin

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
