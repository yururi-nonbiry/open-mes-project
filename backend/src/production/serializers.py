from rest_framework import serializers

from master.models import Item, Warehouse

from .models import MaterialAllocation, PartsUsed, ProductionPlan, ProductionPlanMaterial, WorkProgress
from .services.materials import allocated_quantity_by_material, calc_required_quantity, normal_allocations


class ProductionPlanSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)  # 表示名用
    product_code = serializers.SlugRelatedField(
        source="product",
        slug_field="code",
        queryset=Item.objects.filter(item_type__in=Item.PRODUCIBLE_TYPES)
    )

    class Meta:
        model = ProductionPlan
        fields = [
            "id",
            "plan_name",
            "product_code",
            "production_plan",  # FK to another ProductionPlan (referenced plan)
            "planned_quantity",
            "planned_start_datetime",
            "planned_end_datetime",
            "actual_start_datetime",
            "actual_end_datetime",
            "status",  # ステータスの内部キー (例: 'PENDING', 'IN_PROGRESS')
            "status_display",  # ステータスの表示名 (例: '未着手', '進行中')
            "remarks",
            "created_at",
            "updated_at",
        ]
        # status/実績日時は完成品の在庫計上・材料消費を伴う update_production_progress_service
        # (ProductionPlanViewSet.update_progress) 経由でのみ変更させ、直接のPATCHでは変更不可にする。
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "status",
            "status_display",
            "actual_start_datetime",
            "actual_end_datetime",
        ]

    def validate(self, data):
        """
        Check that planned_start_datetime is before planned_end_datetime.
        Handles both create (POST) and partial update (PATCH) scenarios.
        """
        # On updates (PATCH), self.instance will be populated.
        # On creates (POST), self.instance will be None.

        # Determine the start and end datetimes to validate.
        # Use the incoming data if present, otherwise fall back to the existing instance's value (for PATCH).
        if self.instance:  # This is an update
            planned_start = data.get("planned_start_datetime", self.instance.planned_start_datetime)
            planned_end = data.get("planned_end_datetime", self.instance.planned_end_datetime)
        else:  # This is a create
            # For create, model fields planned_start_datetime and planned_end_datetime are required.
            # DRF would have raised a "this field is required" error already if not present.
            planned_start = data.get("planned_start_datetime")
            planned_end = data.get("planned_end_datetime")

        # Only proceed with validation if both dates are available.
        # This check is mostly for safety; for create, they are required by the model,
        # and for update, we've fetched them from data or instance.
        # 製品を変えると所要部品をBOMマスターからコピーし直すため、引当が残っている計画では変更させない
        new_product = data.get("product")
        if self.instance and new_product is not None and new_product.code != self.instance.product_id:
            if normal_allocations(self.instance.material_allocations.all()).exists():
                raise serializers.ValidationError(
                    {"product_code": "材料の引当がある生産計画の製品は変更できません。先に引当を解除してください。"}
                )

        if planned_start is not None and planned_end is not None:
            if planned_start >= planned_end:
                # The error message points to 'planned_end_datetime'.
                # A more general message could be:
                # "Planned start datetime must be before planned end datetime."
                raise serializers.ValidationError(
                    {"planned_end_datetime": "Planned end datetime must be after planned start datetime."}
                )
        return data


class PartsUsedSerializer(serializers.ModelSerializer):
    """
    使用部品モデルのためのシリアライザ
    """
    part_code = serializers.SlugRelatedField(
        source="part",
        slug_field="code",
        queryset=Item.objects.filter(item_type="material")
    )
    warehouse = serializers.SlugRelatedField(
        source="warehouse_rel",
        slug_field="warehouse_number",
        queryset=Warehouse.objects.all(),
        allow_null=True,
        required=False
    )

    class Meta:
        model = PartsUsed
        fields = [
            "id",
            "production_plan",  # 生産計画へのForeignKey
            "part_code",
            "warehouse",  # 追加
            "quantity_used",
            "used_datetime",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class RequiredPartWarehouseSerializer(serializers.Serializer):
    warehouse = serializers.CharField()
    available_quantity = serializers.IntegerField(help_text="この倉庫の引当可能数")


class RequiredPartSerializer(serializers.Serializer):
    """生産計画の所要部品と引当状況(plans/{id}/required-parts/ の応答)。"""

    part_code = serializers.CharField()
    part_name = serializers.CharField()
    unit = serializers.CharField()
    quantity_per_unit = serializers.DecimalField(max_digits=12, decimal_places=3, help_text="製品1個あたり所要数量")
    required_quantity = serializers.IntegerField(help_text="計画全体の所要数量")
    already_allocated_quantity = serializers.IntegerField(help_text="所要量に対して引当済の数量")
    additional_issued_quantity = serializers.IntegerField(help_text="所要量とは別に追加出庫した数量")
    inventory_quantity = serializers.IntegerField(help_text="全倉庫の引当可能数の合計")
    warehouses = RequiredPartWarehouseSerializer(many=True, help_text="引当可能な在庫がある倉庫(引当時に選ぶ)")


class ProductionPlanMaterialSerializer(serializers.ModelSerializer):
    """生産計画ごとの所要部品。所要数量(計画全体)は1個あたり所要数量と計画数量から計算する。"""

    production_plan = serializers.PrimaryKeyRelatedField(queryset=ProductionPlan.objects.all())
    material_code = serializers.SlugRelatedField(
        source="material",
        slug_field="code",
        queryset=Item.objects.filter(item_type__in=Item.CONSUMABLE_TYPES),
        error_messages={"does_not_exist": "指定された部品コードは存在しないか、材料・中間品として登録されていません。"},
    )
    material_name = serializers.CharField(source="material.name", read_only=True)
    material_unit = serializers.CharField(source="material.unit", read_only=True)

    class Meta:
        model = ProductionPlanMaterial
        fields = [
            "id",
            "production_plan",
            "material_code",
            "material_name",
            "material_unit",
            "quantity_per_unit",
            "required_quantity",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "required_quantity", "created_at", "updated_at"]
        validators = []  # (計画, 部品) の重複は validate() で日本語のメッセージにして返す

    def validate_quantity_per_unit(self, value):
        if value <= 0:
            raise serializers.ValidationError("所要数量は0より大きい値を入力してください。")
        return value

    def validate(self, attrs):
        instance = self.instance
        plan = attrs.get("production_plan", getattr(instance, "production_plan", None))
        material = attrs.get("material", getattr(instance, "material", None))
        quantity_per_unit = attrs.get("quantity_per_unit", getattr(instance, "quantity_per_unit", None))

        if instance and plan.pk != instance.production_plan_id:
            raise serializers.ValidationError({"production_plan": "所要部品の生産計画は変更できません。"})
        ensure_plan_materials_editable(plan)
        if material.code == plan.product_id:
            raise serializers.ValidationError({"material_code": "計画の製品自身は部品にできません。"})
        duplicates = ProductionPlanMaterial.objects.filter(production_plan=plan, material=material)
        if instance:
            duplicates = duplicates.exclude(pk=instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError({"material_code": "この部品は既にこの生産計画に登録されています。"})

        allocated = allocated_quantity_by_material(plan)
        if instance and material.code != instance.material_id and allocated.get(instance.material_id, 0) > 0:
            raise serializers.ValidationError(
                {"material_code": "引当済みの部品は別の部品に変更できません。先に引当を解除してください。"}
            )
        required = calc_required_quantity(quantity_per_unit, plan.planned_quantity)
        if required < allocated.get(material.code, 0):
            raise serializers.ValidationError(
                {
                    "quantity_per_unit": (
                        f"所要数量({required})が引当済数量({allocated[material.code]})を下回ります。"
                        "先に引当を解除してください。"
                    )
                }
            )
        attrs["required_quantity"] = required
        return attrs


def ensure_plan_materials_editable(plan):
    """完了・中止した計画の所要部品は履歴として固定する。"""
    if plan.status in (ProductionPlan.Status.COMPLETED, ProductionPlan.Status.CANCELLED):
        raise serializers.ValidationError(f"{plan.get_status_display()}の生産計画の部品構成は変更できません。")


class MaterialAllocationSerializer(serializers.ModelSerializer):
    """
    材料引当モデルのためのシリアライザ
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    allocation_type_display = serializers.CharField(source="get_allocation_type_display", read_only=True)
    production_plan_name = serializers.CharField(source="production_plan.plan_name", read_only=True)
    material_code = serializers.SlugRelatedField(source="material", slug_field="code", read_only=True)
    warehouse = serializers.SlugRelatedField(source="warehouse_rel", slug_field="warehouse_number", read_only=True)

    class Meta:
        model = MaterialAllocation
        fields = [
            "id",
            "production_plan",
            "production_plan_name",
            "material_code",
            "warehouse",
            "allocated_quantity",
            "allocation_datetime",
            "status",
            "status_display",
            "allocation_type",
            "allocation_type_display",
            "remarks",
            "created_at",
            "updated_at",
        ]
        # 引当内容は在庫の reserved と連動するため、作成は plans/{id}/allocate-materials/、
        # status の変更は change-status アクション、解除は削除(destroy)経由でのみ行う。
        # 直接の更新で変更できるのは備考のみ。
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "production_plan",
            "allocated_quantity",
            "allocation_datetime",
            "status",
            "status_display",
            "allocation_type",
            "allocation_type_display",
            "production_plan_name",
        ]


class WorkProgressSerializer(serializers.ModelSerializer):
    """
    作業進捗モデルのためのシリアライザ
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    production_plan_name = serializers.CharField(source="production_plan.plan_name", read_only=True)
    operator_username = serializers.CharField(source="operator.username", read_only=True, allow_null=True)

    class Meta:
        model = WorkProgress
        fields = [
            "id",
            "production_plan",
            "production_plan_name",
            "process_step",
            "operator",
            "operator_username",
            "start_datetime",
            "end_datetime",
            "quantity_completed",
            "actual_reported_quantity",
            "defective_reported_quantity",
            "status",
            "status_display",
            "remarks",
            "created_at",
            "updated_at",
        ]
        # status/quantity系は在庫調整・材料消費を伴う update_production_progress_service
        # (ProductionPlanViewSet.update_progress) 経由でのみ変更させ、直接のPATCHでは変更不可にする。
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "status",
            "quantity_completed",
            "actual_reported_quantity",
            "defective_reported_quantity",
            "status_display",
            "production_plan_name",
            "operator_username",
        ]

    def validate(self, data):
        """
        Check that start_datetime is before end_datetime.
        Handles both create (POST) and partial update (PATCH) scenarios.
        """
        if self.instance:  # This is an update
            start = data.get("start_datetime", self.instance.start_datetime)
            end = data.get("end_datetime", self.instance.end_datetime)
        else:  # This is a create
            start = data.get("start_datetime")
            end = data.get("end_datetime")

        if start and end:
            if start >= end:
                raise serializers.ValidationError({"end_datetime": "End datetime must be after start datetime."})
        return data
