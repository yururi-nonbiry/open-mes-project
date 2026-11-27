from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Exists, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from master.models import BillOfMaterial
from django_filters import rest_framework as filters  # django-filterをインポート
from rest_framework import (
    permissions,
    status,  # HTTPステータスコードをインポート
    viewsets,
)
from rest_framework.decorators import action  # actionデコレータをインポート
from rest_framework.filters import OrderingFilter  # OrderingFilterをインポート
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response  # Responseをインポート
from rest_framework.views import APIView  # APIViewをインポート

from base.pagination import StandardResultsSetPagination
from base.feature_settings import apply_terms
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
    material_required_quantities,
    trim_child_plans,
)
from .services.bulk_allocation import bulk_allocate_materials, get_allocation_overview
from .services.queries import get_required_parts_for_plans
from .services.merge import find_merge_groups, merge_blocker, merge_plans, release_merged_plans, unmerge_plan
from .services.materials import allocated_quantity_by_material, normal_allocations


class ProductionPlanApiPagination(StandardResultsSetPagination):
    """生産計画の一覧のページ分け。応答の形は他の一覧と同じ(総ページ数・現在ページを含む)で、件数だけ多めにする。"""

    page_size = 100
    max_page_size = 200


def _count_of(queryset):
    """OuterRef で外側の行に絞った queryset の件数を返すサブクエリ(該当なしは 0)。"""
    counted = queryset.order_by().annotate(_group=Value(1)).values("_group").annotate(total=Count("pk")).values("total")
    return Coalesce(Subquery(counted[:1], output_field=IntegerField()), 0)


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
            .select_related("product", "parent_plan", "merged_into", "purpose_rel", "line_rel")
            # 件数はサブクエリで数える(1対多の結合を3つ重ねて Count(distinct) すると、行数の積に膨らんで遅くなる)
            .annotate(
                pending_intermediate_count=_count_of(
                    ProductionPlanMaterial.objects.filter(
                        production_plan=OuterRef("pk"),
                        material__item_type="intermediate",
                        supply_method=ProductionPlanMaterial.SupplyMethod.UNDECIDED,
                    )
                ),
                child_plan_count=_count_of(ProductionPlan.objects.filter(parent_plan=OuterRef("pk"))),
                merged_plan_count=_count_of(ProductionPlan.objects.filter(merged_into=OuterRef("pk"))),
                has_bom=Exists(BillOfMaterial.objects.filter(product_id=OuterRef("product_id"))),
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
        # 統合計画の所要部品は元計画の(計画ごとに編集した)所要量の合計のため、BOMマスターの構成で上書きさせない
        if plan.merged_plans.exists():
            return error_response("統合計画の部品構成は初期化できません。変更する場合は統合を解除してください。")
        if normal_allocations(plan.material_allocations.all()).exists():
            return error_response(
                apply_terms("部品の引当がある生産計画の部品構成は初期化できません。先に引当を解除してください。")
            )
        previous_required = material_required_quantities(plan)
        snapshot_plan_materials(plan)
        trim_child_plans(plan, previous_required)
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
                "message": apply_terms("追加ピッキングしました。"),
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

    def _plans_from_ids(self, ids):
        """ids(UUID文字列のリスト)に一致する計画を、指定順で返す。"""
        if not isinstance(ids, list) or not ids:
            raise ValueError("生産計画を1件以上指定してください。")
        try:
            plans = {str(p.id): p for p in self.get_queryset().filter(pk__in=ids)}
        except (DjangoValidationError, ValueError):
            raise ValueError("生産計画の指定が不正です。") from None
        return [plans[str(i)] for i in ids if str(i) in plans]

    @action(detail=False, methods=["get"], url_path="allocation-overview")
    def allocation_overview(self, request):
        """一覧用に、計画ごとの引当状況(マスターの有無・引当の進み具合・在庫が足りているか)を返します。"""
        ids = [i for i in request.query_params.get("ids", "").split(",") if i]
        try:
            plans = self._plans_from_ids(ids)
        except ValueError as e:
            return error_response(e)
        parts_by_plan = get_required_parts_for_plans(plans)
        return Response([get_allocation_overview(p, has_bom=p.has_bom, parts=parts_by_plan[p.pk]) for p in plans])

    @action(detail=False, methods=["post"], url_path="bulk-allocate-materials")
    def bulk_allocate_materials(self, request):
        """
        複数の生産計画の未引当分を、在庫の多い倉庫からまとめて引き当てます。計画ごとに結果を返します。
        merge が true のときは、同一品番の計画を先に統合計画にまとめてから引き当てます。
        """
        try:
            plans = self._plans_from_ids(request.data.get("plan_ids"))
            merge = request.data.get("merge", False)
            if not isinstance(merge, bool):
                raise ValueError("merge は true / false で指定してください。")
            results = bulk_allocate_materials(plans, merge=merge)
        except ValueError as e:
            return error_response(e)
        return Response({"results": results}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="merge-candidates")
    def merge_candidates(self, request):
        """指定した計画のうち、同一品番で1つの統合計画にまとめられるグループを返します。"""
        ids = [i for i in request.query_params.get("ids", "").split(",") if i]
        try:
            plans = self._plans_from_ids(ids)
        except ValueError as e:
            return error_response(e)
        groups = [
            {
                "product_code": g[0].product_id,
                "product_name": g[0].product.name if g[0].product else "",
                # 同じ品番でも用途が違えば別のグループになる(画面でグループを区別するのに使う)
                "purpose": g[0].purpose,
                "total_quantity": sum(p.planned_quantity for p in g),
                "earliest_end_datetime": min(p.planned_end_datetime for p in g),
                "plans": [
                    {
                        "id": p.id,
                        "plan_name": p.plan_name,
                        "planned_quantity": p.planned_quantity,
                        "planned_end_datetime": p.planned_end_datetime,
                    }
                    for p in g
                ],
            }
            for g in find_merge_groups(plans)
        ]
        return Response(groups)

    @action(detail=False, methods=["get"], url_path="merge-blockers")
    def merge_blockers(self, request):
        """指定した計画ごとに、統合できない理由を返す(統合の確認が出ない理由を画面に示すため)。"""
        ids = [i for i in request.query_params.get("ids", "").split(",") if i]
        try:
            plans = self._plans_from_ids(ids)
        except ValueError as e:
            return error_response(e)
        grouped = {p.id for g in find_merge_groups(plans) for p in g}
        rows = []
        for p in plans:
            if p.id in grouped:
                continue
            reason = merge_blocker(p) or (
                "製品が未設定です。" if not p.product_id else "同じ品番・用途で統合できる計画が、チェックした中に他にありません。"
            )
            rows.append({"plan_id": p.id, "plan_name": p.plan_name, "reason": reason})
        return Response(rows)

    @action(detail=False, methods=["post"], url_path="merge-plans")
    def merge_plans(self, request):
        """同一品番の生産計画を1つの統合計画にまとめます。"""
        try:
            plans = self._plans_from_ids(request.data.get("plan_ids"))
            merged = merge_plans(plans)
        except ValueError as e:
            return error_response(e)
        return Response(
            {"message": "生産計画を統合しました。", "data": ProductionPlanSerializer(merged).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="unmerge")
    def unmerge(self, request, pk=None):
        """統合計画の統合を解除し、元の生産計画を未着手に戻します。"""
        try:
            unmerge_plan(self.get_object())
        except ValueError as e:
            return error_response(e)
        return Response({"message": "統合を解除しました。"})

    def destroy(self, request, *args, **kwargs):
        plan = self.get_object()
        with transaction.atomic():
            # 同時の引当・進捗更新と競合しないよう、計画の行をロックして最新の状態で判定する
            plan = ProductionPlan.objects.select_for_update().get(pk=plan.pk)
            # 統合元(統合済み、および統合計画の完了で按分され完了になった計画)は統合計画で扱う
            if plan.status == ProductionPlan.Status.MERGED or plan.merged_into_id:
                return error_response("統合済みの生産計画は削除できません。統合先の生産計画で統合を解除してください。")
            # 完了・進行中の計画は完成品在庫・材料消費の実績があるため削除させない(中止で扱う)
            if plan.status in (ProductionPlan.Status.COMPLETED, ProductionPlan.Status.IN_PROGRESS):
                return error_response("完了・進行中の生産計画は削除できません。")
            # 引当が残ったまま削除すると、在庫の引当数(reserved)が解放されず残り続けるため、先に引当を解除してもらう
            if plan.material_allocations.filter(status=MaterialAllocation.Status.ALLOCATED).exists():
                return error_response(
                    apply_terms("引当済みの部品がある生産計画は削除できません。先に部品の引当を解除してください。")
                )
            # ピッキング済みの部品が残る計画を削除すると出庫の記録が消え、
            # 統合計画なら元の計画で二重にピッキングできてしまう
            if plan.material_allocations.filter(status=MaterialAllocation.Status.ISSUED).exists():
                return error_response(
                    apply_terms("ピッキング済みの部品がある生産計画は削除できません。先に部品を返却してください。")
                )
            is_merged = plan.merged_plans.exists()
            # 中止扱いにしてから削除する。未着手・保留の子計画は中止され(signals)、親を失った子計画が残らない
            if plan.status != ProductionPlan.Status.CANCELLED:
                plan.status = ProductionPlan.Status.CANCELLED
                plan.save(update_fields=["status", "updated_at"])
            # 統合計画を削除する場合は、元の計画を未着手に戻し、統合時に中止した子計画を作り直す
            if is_merged:
                release_merged_plans(plan)
            plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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
        # 統合元の計画(統合済み、および統合計画の完了で按分され完了になった計画)は統合計画と二重に数えるため常に除く
        queryset = (
            ProductionPlan.objects.select_related("product")
            .exclude(status=ProductionPlan.Status.MERGED)
            .filter(merged_into__isnull=True)
        )

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


class PartsUsedViewSet(viewsets.ReadOnlyModelViewSet):
    """
    旧来の使用部品(PartsUsed)の参照用API。所要部品は ProductionPlanMaterial に移行したため、
    既存データの確認用に参照だけを残す(登録・変更・削除はできない)。
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

    # 中間品を追加・所要数を増やした結果、見込みが足りなくなった分は子計画を自動で作り、
    # 所要数を減らした・中間品を外した分は子計画を減らす
    def perform_create(self, serializer):
        material = serializer.save()
        auto_arrange_intermediates(material.production_plan)

    def perform_update(self, serializer):
        previous_required = material_required_quantities(serializer.instance.production_plan)
        material = serializer.save()
        trim_child_plans(material.production_plan, previous_required)
        auto_arrange_intermediates(material.production_plan)

    def perform_destroy(self, instance):
        plan = instance.production_plan
        previous_required = material_required_quantities(plan)
        instance.delete()
        trim_child_plans(plan, previous_required)

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

    queryset = (
        MaterialAllocation.objects.all()
        .select_related(
            "production_plan", "production_plan__product", "material", "warehouse_rel", "purpose_rel", "line_rel"
        )
        .order_by("-allocation_datetime")
    )
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
        # 出庫先ラインでの絞り込み("none" はライン未指定)
        line = self.request.query_params.get("line")
        if line == "none":
            queryset = queryset.filter(line_rel__isnull=True)
        elif line:
            queryset = queryset.filter(line_rel__code=line)
        return queryset

    def create(self, request, *args, **kwargs):
        return error_response(
            apply_terms("順立て（部品引当）は plans/{id}/allocate-materials/ から作成してください。"),
            status.HTTP_405_METHOD_NOT_ALLOWED,
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

    def destroy(self, request, *args, **kwargs):
        # 全体進捗を消すと前回の完了数量が失われ、再完了で完成品を二重に計上し、完了の取消で完成品を減らせなくなる
        if self.get_object().process_step == WorkProgress.OVERALL_PROCESS_STEP:
            return error_response("全体進捗は削除できません。進捗は生産計画の進捗更新で変更してください。")
        return super().destroy(request, *args, **kwargs)
