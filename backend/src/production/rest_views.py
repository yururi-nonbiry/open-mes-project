from django.db import transaction  # トランザクションのためにインポート
from django.db.models import Q  # Qオブジェクトをインポート
from django.utils import timezone  # timezoneをインポート
from django.utils.dateparse import parse_datetime  # 日時文字列のパース用
from rest_framework import (
    status,  # HTTPステータスコードをインポート
    viewsets,
)
from rest_framework.decorators import action  # actionデコレータをインポート
from rest_framework.filters import OrderingFilter  # OrderingFilterをインポート

# from rest_framework import permissions # Uncomment if you want to add permissions
from rest_framework.pagination import PageNumberPagination  # Import PageNumberPagination
from rest_framework.response import Response  # Responseをインポート

from inventory.models import Inventory, SalesOrder, StockMovement  # Add StockMovement and SalesOrder
from inventory.rest_views import StandardResultsSetPagination  # inventoryアプリのページネーションクラスをインポート

from .models import MaterialAllocation, PartsUsed, ProductionPlan, WorkProgress
from .serializers import (
    MaterialAllocationSerializer,
    PartsUsedSerializer,
    ProductionPlanSerializer,
    RequiredPartSerializer,
    WorkProgressSerializer,
)
from .services import allocate_materials_service, update_production_progress_service

# from .models import Product, BillOfMaterialItem
# BOMに関連するモデル (仮のインポート、実際には適切なモデルを定義・インポートしてください)
# from .serializers import RequiredPartSerializer # BOM部品用のシリアライザ (仮のインポート)

# Define a constant for the default finished goods warehouse
DEFAULT_FINISHED_GOODS_WAREHOUSE = "FG-MAIN"  # TODO: Make this configurable


# Define a pagination class specifically for Production Plans API
class ProductionPlanApiPagination(PageNumberPagination):
    page_size = 100  # Default number of items per page
    page_size_query_param = "page_size"  # Allow client to override page_size via query param
    max_page_size = 200  # Maximum page size allowed


class ProductionPlanViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Production Plans to be viewed or created.
    """

    serializer_class = ProductionPlanSerializer
    pagination_class = ProductionPlanApiPagination  # Use the custom pagination class for Production Plans
    # permission_classes = [permissions.IsAuthenticated] # Example: Add authentication
    filter_backends = [OrderingFilter]  # OrderingFilterを追加 (他のフィルターがあればそれもリストに含める)
    ordering_fields = [
        "plan_name",
        "product_code",
        "planned_quantity",
        "planned_start_datetime",
        "status",
    ]  # ソート可能なフィールドを指定
    ordering = ["-planned_start_datetime"]  # デフォルトのソート順

    def get_queryset(self):
        queryset = ProductionPlan.objects.all()  # Start with all objects

        # Get query parameters for filtering
        plan_name = self.request.query_params.get("plan_name")
        product_code = self.request.query_params.get("product_code")
        # status = self.request.query_params.get('status') # Keep for single status, or remove if status__in is primary
        statuses_in_str = self.request.query_params.get("status__in")  # New: for multiple statuses
        production_plan_ref = self.request.query_params.get("production_plan_ref")  # For parent plan ID search
        planned_start_after = self.request.query_params.get("planned_start_datetime_after")
        planned_start_before = self.request.query_params.get("planned_start_datetime_before")

        filters = Q()
        if plan_name:
            filters &= Q(plan_name__icontains=plan_name)
        if product_code:
            filters &= Q(product_code__icontains=product_code)

        # Handle status__in for multiple statuses
        if statuses_in_str:
            status_list = [status.strip() for status in statuses_in_str.split(",") if status.strip()]
            if status_list:
                filters &= Q(status__in=status_list)
        # else: # Optional: handle single 'status' param if still needed and status__in is not present
        #     single_status = self.request.query_params.get('status')
        #     if single_status:
        #         filters &= Q(status=single_status)

        if production_plan_ref:
            # 'production_plan' is the CharField in the model storing the reference
            filters &= Q(production_plan__icontains=production_plan_ref)

        if planned_start_after:
            dt_after = parse_datetime(planned_start_after)
            if dt_after:
                filters &= Q(planned_start_datetime__gte=dt_after)

        if planned_start_before:
            dt_before = parse_datetime(planned_start_before)
            if dt_before:
                filters &= Q(planned_start_datetime__lte=dt_before)

        # Apply filters if any
        if filters:
            queryset = queryset.filter(filters)

        # OrderingFilterが 'ordering' クエリパラメータとViewSetの 'ordering'/'ordering_fields' 属性に基づいて
        # ソートを処理するため、ここでの明示的な .order_by() は不要です。
        return queryset

    @action(detail=True, methods=["get"], url_path="required-parts")
    def required_parts(self, request, pk=None):
        """
        特定の生産計画に必要な部品リストを返します。
        このリストは PartsUsed モデルから取得されます。
        """
        production_plan_instance = self.get_object()  # Gets ProductionPlan by its ID (pk)

        # PartsUsed.production_plan (CharField) links to ProductionPlan.production_plan (CharField).
        plan_identifier_for_parts = (
            production_plan_instance.production_plan
        )  # This is the CharField on ProductionPlan model

        if not plan_identifier_for_parts:
            return Response(
                {
                    "detail": (
                        f"生産計画 '{production_plan_instance.plan_name}' (ID: {production_plan_instance.id}) "
                        "には、部品リストを特定するための参照識別子（production_planフィールド）が設定されていません。"
                    )
                },
                status=404,
            )

        # Query PartsUsed based on this string identifier
        parts_used_queryset = PartsUsed.objects.filter(production_plan=plan_identifier_for_parts)

        if not parts_used_queryset.exists():
            return Response(
                {
                    "detail": (
                        f"生産計画 '{production_plan_instance.plan_name}' (ID: {production_plan_instance.id}) "
                        f"の参照識別子 '{plan_identifier_for_parts}' に紐づく使用部品情報は見つかりませんでした。"
                    )
                },
                status=404,
            )

        # Prepare data for the RequiredPartSerializer
        data_for_serializer = []
        from django.db.models import Sum  # Ensure Sum is imported

        for part_used_item in parts_used_queryset:
            part_code = part_used_item.part_code
            part_specific_warehouse = part_used_item.warehouse  # Warehouse from PartsUsed
            current_inventory_quantity = 0

            if part_specific_warehouse:
                # If a specific warehouse is designated for the part, get inventory from that warehouse.
                try:
                    inventory_item = Inventory.objects.get(
                        part_number=part_code, warehouse=part_specific_warehouse, is_active=True, is_allocatable=True
                    )
                    current_inventory_quantity = inventory_item.available_quantity
                except Inventory.DoesNotExist:
                    current_inventory_quantity = 0
                except Inventory.MultipleObjectsReturned:
                    # This case implies multiple inventory entries for the same part in the same warehouse.
                    # Summing them up is a safe approach.
                    inventory_items = Inventory.objects.filter(
                        part_number=part_code, warehouse=part_specific_warehouse, is_active=True, is_allocatable=True
                    )
                    for inv_item in inventory_items:
                        current_inventory_quantity += inv_item.available_quantity
                    if inventory_items.count() > 1:
                        print(
                            f"Warning: Multiple inventory records found for part {part_code} in warehouse "
                            f"{part_specific_warehouse}. Summing quantities."
                        )
            else:
                # If no specific warehouse is designated for the part in PartsUsed,
                # sum available inventory from all warehouses for that part.
                inventory_items = Inventory.objects.filter(part_number=part_code, is_active=True, is_allocatable=True)
                for inv_item in inventory_items:
                    current_inventory_quantity += inv_item.available_quantity

            # Calculate already allocated quantity for this part for the current production plan
            already_allocated_for_part = (
                MaterialAllocation.objects.filter(
                    production_plan=production_plan_instance,  # The specific plan instance for the popup
                    material_code=part_code,
                ).aggregate(total_allocated=Sum("allocated_quantity"))["total_allocated"]
                or 0
            )

            data_for_serializer.append(
                {
                    "part_code": part_code,
                    "part_name": f"{part_code} (名称は別途マスタ参照)",  # Placeholder for part_name
                    "required_quantity": part_used_item.quantity_used,  # Using quantity_used from PartsUsed
                    "unit": "個",  # Placeholder for unit, e.g., '個' (pieces)
                    "inventory_quantity": current_inventory_quantity,
                    "warehouse": part_specific_warehouse,
                    "already_allocated_quantity": already_allocated_for_part,
                }
            )

        serializer = RequiredPartSerializer(data=data_for_serializer, many=True)
        serializer.is_valid(raise_exception=True)  # Ensure data conforms to serializer structure
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="allocate-materials")
    def allocate_materials(self, request, pk=None):
        """
        特定の生産計画に対して資材を割り当てます。
        ロジックは allocate_materials_service に委譲されています。
        """
        production_plan = self.get_object()
        allocations_data = request.data.get("allocations")

        try:
            summary = allocate_materials_service(production_plan, allocations_data)
            return Response(
                {
                    "message": "Materials allocated successfully for production plan.",
                    "production_plan_id": production_plan.id,
                    "allocations_summary": summary,
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": "An unexpected error occurred during material allocation.", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        except ValueError as e:
            return Response({"error": str(e), "details": errors}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": "An unexpected error occurred during material allocation.", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"], url_path="update-progress")
    def update_progress(self, request, pk=None):
        """
        生産計画の進捗を更新します。
        ロジックは update_production_progress_service に委譲されています。
        """
        plan = self.get_object()
        try:
            plan, wp = update_production_progress_service(plan, request.data, request.user)
            return Response(
                {
                    "message": "Production plan progress updated successfully.",
                    "plan_id": plan.id,
                    "new_status": plan.get_status_display(),
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as ve:
            return Response({"error": f"Failed to save progress: {str(ve)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            print(f"Error during progress update: {str(e)}")
            print(traceback.format_exc())
            return Response(
                {"error": "Failed to save progress due to an unexpected error. Please check logs."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "message": "Production plan progress updated successfully.",
                "plan_id": plan.id,
                "new_status": plan.get_status_display(),
            },
            status=status.HTTP_200_OK,
        )


class PartsUsedViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PartsUsed records to be viewed or created.
    """

    queryset = PartsUsed.objects.all().order_by("-used_datetime")
    serializer_class = PartsUsedSerializer
    pagination_class = StandardResultsSetPagination  # ページネーションクラスを指定
    # permission_classes = [permissions.IsAuthenticated] # Example: Add authentication


class MaterialAllocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Material Allocations to be viewed or created.
    """

    queryset = MaterialAllocation.objects.all().select_related("production_plan").order_by("-allocation_datetime")
    serializer_class = MaterialAllocationSerializer
    pagination_class = StandardResultsSetPagination
    # permission_classes = [IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ["material_code", "allocated_quantity", "allocation_datetime", "status"]
    ordering = ["-allocation_datetime"]

    def get_queryset(self):
        queryset = super().get_queryset()
        plan_id = self.request.query_params.get("production_plan_id")
        if plan_id:
            queryset = queryset.filter(production_plan_id=plan_id)
        return queryset


class WorkProgressViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Work Progress records to be viewed or created.
    """

    queryset = (
        WorkProgress.objects.all()
        .select_related("production_plan", "operator")
        .order_by("production_plan", "start_datetime")
    )
    serializer_class = WorkProgressSerializer
    pagination_class = StandardResultsSetPagination
    # permission_classes = [IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ["process_step", "status", "start_datetime", "end_datetime", "quantity_completed"]
    ordering = ["start_datetime"]

    def get_queryset(self):
        queryset = super().get_queryset()
        plan_id = self.request.query_params.get("production_plan_id")
        if plan_id:
            queryset = queryset.filter(production_plan_id=plan_id)

        operator_id = self.request.query_params.get("operator_id")
        if operator_id:
            queryset = queryset.filter(operator_id=operator_id)

        return queryset
