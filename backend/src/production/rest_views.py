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
from django_filters import rest_framework as filters  # django-filterをインポート

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
from .services import (
    allocate_materials_service,
    get_production_plan_required_parts,
    release_material_allocation_service,
    update_material_allocation_status_service,
    update_production_progress_service,
)

# from .models import Product, BillOfMaterialItem
# BOMに関連するモデル (仮のインポート、実際には適切なモデルを定義・インポートしてください)
# from .serializers import RequiredPartSerializer # BOM部品用のシリアライザ (仮のインポート)

from django.conf import settings

# Define a constant for the default finished goods warehouse
DEFAULT_FINISHED_GOODS_WAREHOUSE = settings.DEFAULT_FINISHED_GOODS_WAREHOUSE


# Define a pagination class specifically for Production Plans API
class ProductionPlanApiPagination(PageNumberPagination):
    page_size = 100  # Default number of items per page
    page_size_query_param = "page_size"  # Allow client to override page_size via query param
    max_page_size = 200  # Maximum page size allowed


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class ProductionPlanFilter(filters.FilterSet):
    """
    生産計画のフィルタリングクラス
    """
    plan_name = filters.CharFilter(lookup_expr='icontains')
    product_code = filters.CharFilter(field_name="product__code", lookup_expr='icontains')
    planned_start_datetime_after = filters.DateTimeFilter(field_name="planned_start_datetime", lookup_expr='gte')
    planned_start_datetime_before = filters.DateTimeFilter(field_name="planned_start_datetime", lookup_expr='lte')
    status__in = CharInFilter(field_name='status', lookup_expr='in')

    class Meta:
        model = ProductionPlan
        fields = [
            'plan_name', 
            'product_code', 
            'planned_start_datetime_after', 
            'planned_start_datetime_before',
            'status__in'
        ]


class ProductionPlanViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Production Plans to be viewed or created.
    """

    serializer_class = ProductionPlanSerializer
    pagination_class = ProductionPlanApiPagination  # Use the custom pagination class for Production Plans
    # permission_classes = [permissions.IsAuthenticated] # Example: Add authentication
    filter_backends = [filters.DjangoFilterBackend, OrderingFilter]  # DjangoFilterBackendを追加
    filterset_class = ProductionPlanFilter  # フィルタークラスを指定
    ordering_fields = [
        "plan_name",
        "product",
        "planned_quantity",
        "planned_start_datetime",
        "status",
    ]  # ソート可能なフィールドを指定
    ordering = ["-planned_start_datetime"]  # デフォルトのソート順

    def filter_queryset(self, queryset):
        # Translate sorting by product_code to product
        ordering = self.request.query_params.get("ordering", "")
        if "product_code" in ordering:
            # request.query_params は読み取り専用プロパティ(内部のrequest._request.GETを返すだけ)
            # のため、直接代入はできない。元となる request._request.GET を書き換える。
            params = self.request.query_params.copy()
            params["ordering"] = ordering.replace("product_code", "product")
            self.request._request.GET = params
        return super().filter_queryset(queryset)

    def get_queryset(self):
        # django-filterが自動で処理するため、手動のフィルタリングを削除
        return ProductionPlan.objects.all().select_related("product")

    @action(detail=True, methods=["get"], url_path="required-parts")
    def required_parts(self, request, pk=None):
        """
        特定の生産計画に必要な部品リストを返します。
        ロジックは get_production_plan_required_parts サービスに委譲されています。
        """
        production_plan_instance = self.get_object()
        required_parts_data = get_production_plan_required_parts(production_plan_instance)

        if not required_parts_data:
            # 部品が見つからない場合は空リストを返す（200 OK）
            return Response([])

        serializer = RequiredPartSerializer(data=required_parts_data, many=True)
        serializer.is_valid(raise_exception=True)
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


class PartsUsedViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PartsUsed records to be viewed or created.
    """

    queryset = PartsUsed.objects.all().select_related("part", "warehouse_rel").order_by("-used_datetime")
    serializer_class = PartsUsedSerializer
    pagination_class = StandardResultsSetPagination  # ページネーションクラスを指定
    # permission_classes = [permissions.IsAuthenticated] # Example: Add authentication

    def get_queryset(self):
        queryset = super().get_queryset()
        production_plan = self.request.query_params.get("production_plan")
        if production_plan:
            queryset = queryset.filter(production_plan__icontains=production_plan)

        part_code = self.request.query_params.get("part_code")
        if part_code:
            queryset = queryset.filter(part__code__icontains=part_code)

        return queryset


class MaterialAllocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Material Allocations to be viewed or created.
    """

    queryset = MaterialAllocation.objects.all().select_related("production_plan").order_by("-allocation_datetime")
    serializer_class = MaterialAllocationSerializer
    pagination_class = StandardResultsSetPagination
    # permission_classes = [IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ["material", "allocated_quantity", "allocation_datetime", "status"]
    ordering = ["-allocation_datetime"]

    def get_queryset(self):
        queryset = super().get_queryset()
        plan_id = self.request.query_params.get("production_plan_id")
        if plan_id:
            queryset = queryset.filter(production_plan_id=plan_id)
        return queryset

    def destroy(self, request, *args, **kwargs):
        """
        引当の削除は在庫の reserved 解放を伴うため、専用サービスに委譲します。
        出庫済み・返却済みの引当は実在庫の増減を伴う履歴のため削除できません。
        """
        allocation = self.get_object()
        try:
            release_material_allocation_service(allocation)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        """
        材料引当のステータスを変更します（出庫/返却）。
        在庫の増減を伴うため update_material_allocation_status_service に委譲します。
        """
        allocation = self.get_object()
        new_status = request.data.get("status")
        if not new_status:
            return Response({"error": "status is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            allocation = update_material_allocation_status_service(allocation, new_status, request.user)
            serializer = self.get_serializer(allocation)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


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
