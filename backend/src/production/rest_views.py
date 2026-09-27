from django.db.models import Count, Q
from django_filters import rest_framework as filters  # django-filterをインポート
from rest_framework import (
    permissions,
    status,  # HTTPステータスコードをインポート
    viewsets,
)
from rest_framework.decorators import action  # actionデコレータをインポート
from rest_framework.filters import OrderingFilter  # OrderingFilterをインポート
from rest_framework.pagination import PageNumberPagination  # Import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response  # Responseをインポート
from rest_framework.views import APIView  # APIViewをインポート

from base.pagination import StandardResultsSetPagination
from base.responses import error_response

from .models import MaterialAllocation, PartsUsed, ProductionPlan, ProductionPlanMaterial, WorkProgress
from .serializers import (
    IntermediateRequirementSerializer,
    MaterialAllocationSerializer,
    PartsUsedSerializer,
    ProductionPlanMaterialSerializer,
    ProductionPlanSerializer,
    RequiredPartSerializer,
    WorkProgressSerializer,
    ensure_plan_materials_editable,
)
from .services import (
    allocate_materials_service,
    get_production_plan_required_parts,
    issue_additional_materials_service,
    release_material_allocation_service,
    simulate_parts_supply,
    snapshot_plan_materials,
    update_material_allocation_status_service,
    update_production_progress_service,
)
from .services.intermediates import (
    arrange_intermediates_service,
    auto_arrange_intermediates,
    get_intermediate_requirements,
)
from .services.materials import allocated_quantity_by_material, normal_allocations


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
    permission_classes = [permissions.IsAuthenticated]
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
        return (
            ProductionPlan.objects.all()
            .select_related("product", "parent_plan")
            .annotate(
                pending_intermediate_count=Count(
                    "materials",
                    filter=Q(
                        materials__material__item_type="intermediate",
                        materials__supply_method=ProductionPlanMaterial.SupplyMethod.UNDECIDED,
                    ),
                    distinct=True,
                ),
                child_plan_count=Count("child_plans", distinct=True),
            )
        )

    @action(detail=True, methods=["get"], url_path="intermediate-requirements")
    def intermediate_requirements(self, request, pk=None):
        """計画の所要部品のうち中間品ごとの手配状況(在庫の見込み・子計画・不足)を返します。"""
        plan = self.get_object()
        return Response(IntermediateRequirementSerializer(get_intermediate_requirements(plan), many=True).data)

    @action(detail=True, methods=["post"], url_path="arrange-intermediates")
    def arrange_intermediates(self, request, pk=None):
        """
        中間品の手配方法を決めます(子計画を立てる / 在庫を使う)。

        Request body: {"decisions": [{"material_code", "method": "CHILD_PLAN" | "STOCK", "quantity"(任意)}]}
        """
        plan = self.get_object()
        try:
            created = arrange_intermediates_service(plan, request.data.get("decisions"))
        except ValueError as e:
            return error_response(e)
        message = f"子計画を{len(created)}件作成しました。" if created else "手配方法を更新しました。"
        return Response(
            {
                "message": message,
                "data": {
                    "created_plans": ProductionPlanSerializer(created, many=True).data,
                    "requirements": IntermediateRequirementSerializer(
                        get_intermediate_requirements(plan), many=True
                    ).data,
                },
            }
        )

    @action(detail=True, methods=["get"], url_path="required-parts")
    def required_parts(self, request, pk=None):
        """
        特定の生産計画に必要な部品リストを返します。
        ロジックは get_production_plan_required_parts サービスに委譲されています。
        """
        production_plan_instance = self.get_object()
        required_parts_data = get_production_plan_required_parts(production_plan_instance)
        return Response(RequiredPartSerializer(required_parts_data, many=True).data)

    @action(detail=True, methods=["post"], url_path="reset-materials")
    def reset_materials(self, request, pk=None):
        """
        計画の所要部品をBOMマスターの構成でコピーし直します(計画ごとの編集内容は破棄されます)。
        所要量の消化に数える引当が残っている場合は、引当と構成が食い違うため実行できません。
        """
        plan = self.get_object()
        ensure_plan_materials_editable(plan)
        if normal_allocations(plan.material_allocations.all()).exists():
            return error_response("材料の引当がある生産計画の部品構成は初期化できません。先に引当を解除してください。")
        snapshot_plan_materials(plan)
        auto_arrange_intermediates(plan)
        materials = ProductionPlanMaterial.objects.filter(production_plan=plan).select_related("material")
        return Response(
            {
                "message": "部品構成をBOMマスターから読み込み直しました。",
                "data": ProductionPlanMaterialSerializer(materials, many=True).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="issue-additional-materials")
    def issue_additional_materials(self, request, pk=None):
        """
        歩留まり・ロス等で不足した部品を追加出庫します(引当を経ずに即時出庫)。

        Request body: {"items": [{"part_number", "warehouse", "quantity"}], "remarks": "理由など(任意)"}
        """
        plan = self.get_object()
        try:
            allocations = issue_additional_materials_service(
                plan, request.data.get("items"), request.user, remarks=request.data.get("remarks")
            )
        except ValueError as e:
            return error_response(e)
        return Response(
            {
                "message": "追加出庫しました。",
                "data": MaterialAllocationSerializer(allocations, many=True).data,
            }
        )

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
        except ValueError as e:
            return error_response(e)
        return Response(
            {
                "message": "Materials allocated successfully for production plan.",
                "production_plan_id": production_plan.id,
                "allocations_summary": summary,
            },
            status=status.HTTP_200_OK,
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
        except ValueError as ve:
            return error_response(f"Failed to save progress: {ve}")
        return Response(
            {
                "message": "Production plan progress updated successfully.",
                "plan_id": plan.id,
                "new_status": plan.get_status_display(),
            },
            status=status.HTTP_200_OK,
        )


class PartsSupplySimulationView(APIView):
    """
    複数の生産計画（納入品番）を横断して、共通部品の供給可否をシミュレーションするビュー。

    クエリパラメータ:
      - plan_ids: 対象とする生産計画IDのカンマ区切りリスト（指定時はstatus指定を無視）
      - status: 対象とするステータスのカンマ区切りリスト（省略時は PENDING, IN_PROGRESS）
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        plan_ids_param = request.query_params.get("plan_ids")
        queryset = ProductionPlan.objects.select_related("product")

        if plan_ids_param:
            plan_ids = [pid for pid in plan_ids_param.split(",") if pid]
            queryset = queryset.filter(id__in=plan_ids)
        else:
            status_param = request.query_params.get("status")
            status_list = [s for s in status_param.split(",") if s] if status_param else ["PENDING", "IN_PROGRESS"]
            queryset = queryset.filter(status__in=status_list)

        plans = queryset.order_by("planned_start_datetime")
        result = simulate_parts_supply(plans)
        return Response(result)


class PartsUsedViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PartsUsed records to be viewed or created.
    """

    queryset = PartsUsed.objects.all().select_related("part", "warehouse_rel").order_by("-used_datetime")
    serializer_class = PartsUsedSerializer
    pagination_class = StandardResultsSetPagination  # ページネーションクラスを指定
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        production_plan = self.request.query_params.get("production_plan")
        if production_plan:
            queryset = queryset.filter(production_plan__icontains=production_plan)

        part_code = self.request.query_params.get("part_code")
        if part_code:
            queryset = queryset.filter(part__code__icontains=part_code)

        return queryset


class ProductionPlanMaterialViewSet(viewsets.ModelViewSet):
    """
    生産計画ごとの所要部品。計画作成時にBOMマスターからコピーされ、計画ごとに編集できます。
    一覧は production_plan_id で絞り込みます。
    """

    queryset = ProductionPlanMaterial.objects.all().select_related("material", "production_plan")
    serializer_class = ProductionPlanMaterialSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        plan_id = self.request.query_params.get("production_plan_id")
        if plan_id:
            queryset = queryset.filter(production_plan_id=plan_id)
        return queryset

    # 中間品を追加・所要数を増やした結果、見込みが足りなくなった分は子計画を自動で作る
    def perform_create(self, serializer):
        material = serializer.save()
        auto_arrange_intermediates(material.production_plan)

    def perform_update(self, serializer):
        material = serializer.save()
        auto_arrange_intermediates(material.production_plan)

    def destroy(self, request, *args, **kwargs):
        material = self.get_object()
        ensure_plan_materials_editable(material.production_plan)
        if allocated_quantity_by_material(material.production_plan).get(material.material_id, 0) > 0:
            return error_response("引当済みの部品は削除できません。先に引当を解除してください。")
        return super().destroy(request, *args, **kwargs)


class MaterialAllocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Material Allocations to be viewed or created.
    """

    queryset = MaterialAllocation.objects.all().select_related("production_plan").order_by("-allocation_datetime")
    serializer_class = MaterialAllocationSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ["material", "allocated_quantity", "allocation_datetime", "status"]
    ordering = ["-allocation_datetime"]

    def get_queryset(self):
        queryset = super().get_queryset()
        plan_id = self.request.query_params.get("production_plan_id")
        if plan_id:
            queryset = queryset.filter(production_plan_id=plan_id)
        return queryset

    def create(self, request, *args, **kwargs):
        return error_response(
            "材料引当は plans/{id}/allocate-materials/ から作成してください。", status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def destroy(self, request, *args, **kwargs):
        """
        引当の削除は在庫の reserved 解放を伴うため、専用サービスに委譲します。
        出庫済み・返却済みの引当は実在庫の増減を伴う履歴のため削除できません。
        """
        allocation = self.get_object()
        try:
            release_material_allocation_service(allocation)
        except ValueError as e:
            return error_response(e)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        """
        材料引当のステータスを変更します（出庫/返却）。
        在庫の増減を伴うため update_material_allocation_status_service に委譲します。
        """
        allocation = self.get_object()
        new_status = request.data.get("status")
        if not new_status:
            return error_response("status is required.")

        try:
            allocation = update_material_allocation_status_service(allocation, new_status, request.user)
        except ValueError as e:
            return error_response(e)
        serializer = self.get_serializer(allocation)
        return Response(serializer.data, status=status.HTTP_200_OK)


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
    permission_classes = [IsAuthenticated]
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
