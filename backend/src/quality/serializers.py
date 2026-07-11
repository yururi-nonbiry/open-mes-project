from django.db import transaction
from rest_framework import serializers

from .models import InspectionItem, InspectionResult, InspectionResultDetail, MeasurementDetail


class MeasurementDetailSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False, allow_null=True)  # Allow ID for updates, and allow null for new items

    class Meta:
        model = MeasurementDetail
        fields = [
            "id",
            "name",
            "measurement_type",
            "specification_nominal",
            "specification_upper_limit",
            "specification_lower_limit",
            "specification_unit",
            "expected_qualitative_result",
            "order",
        ]


class InspectionItemListSerializer(serializers.ModelSerializer):
    """Serializer for listing InspectionItems."""

    inspection_type_display = serializers.CharField(source="get_inspection_type_display", read_only=True)
    target_object_type_display = serializers.CharField(source="get_target_object_type_display", read_only=True)

    class Meta:
        model = InspectionItem
        fields = [
            "id",
            "code",
            "name",
            "description",
            "inspection_type",
            "inspection_type_display",
            "target_object_type",
            "target_object_type_display",
            "is_active",
        ]


class InspectionItemDetailSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating InspectionItems with nested MeasurementDetails."""

    measurement_details = MeasurementDetailSerializer(many=True)
    inspection_type_display = serializers.CharField(source="get_inspection_type_display", read_only=True)
    target_object_type_display = serializers.CharField(source="get_target_object_type_display", read_only=True)

    class Meta:
        model = InspectionItem
        fields = [
            "id",
            "code",
            "name",
            "description",
            "inspection_type",
            "inspection_type_display",
            "target_object_type",
            "target_object_type_display",
            "is_active",
            "measurement_details",
        ]

    @transaction.atomic
    def create(self, validated_data):
        details_data = validated_data.pop("measurement_details")
        inspection_item = InspectionItem.objects.create(**validated_data)
        for detail_data in details_data:
            MeasurementDetail.objects.create(inspection_item=inspection_item, **detail_data)
        return inspection_item

    @transaction.atomic
    def update(self, instance, validated_data):
        details_data = validated_data.pop("measurement_details")
        instance = super().update(instance, validated_data)

        detail_mapping = {item.id: item for item in instance.measurement_details.all()}

        for detail_data in details_data:
            detail_id = detail_data.get("id")
            if detail_id and detail_id in detail_mapping:
                detail_instance = detail_mapping.pop(detail_id)
                for attr, value in detail_data.items():
                    setattr(detail_instance, attr, value)
                detail_instance.save()
            else:
                # Create new detail
                detail_data.pop("id", None)  # Remove null id if present
                MeasurementDetail.objects.create(inspection_item=instance, **detail_data)

        # Delete details that were not in the payload
        if detail_mapping:
            for _detail_id, detail_instance in detail_mapping.items():
                detail_instance.delete()

        return instance


class InspectionResultDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionResultDetail
        fields = ["measurement_detail", "measured_value_numeric", "result_qualitative"]


def _judge_detail(measurement_detail, measured_value_numeric, result_qualitative):
    """
    測定・判定詳細1件の規格に対する合否を判定する。
    値が未入力の場合は判定不能として None を返す（合格/不合格ではなく保留扱いにするため）。
    """
    if measurement_detail.measurement_type == "quantitative":
        if measured_value_numeric is None:
            return None
        lower = measurement_detail.specification_lower_limit
        upper = measurement_detail.specification_upper_limit
        if lower is not None and measured_value_numeric < lower:
            return False
        if upper is not None and measured_value_numeric > upper:
            return False
        return True
    else:  # qualitative
        if not result_qualitative:
            return None
        expected = measurement_detail.expected_qualitative_result
        if not expected:
            return True
        return result_qualitative.strip().lower() == expected.strip().lower()


def compute_overall_judgment(details_data):
    """
    各測定・判定詳細の合否から検査実績全体の判定を決定する。
    1件でも不合格があれば不合格、未入力の項目があれば保留、全て合格なら合格。
    """
    if not details_data:
        return "pending"
    per_detail_results = [
        _judge_detail(
            detail_data["measurement_detail"],
            detail_data.get("measured_value_numeric"),
            detail_data.get("result_qualitative"),
        )
        for detail_data in details_data
    ]
    if any(result is False for result in per_detail_results):
        return "fail"
    if any(result is None for result in per_detail_results):
        return "pending"
    return "pass"


class InspectionResultSerializer(serializers.ModelSerializer):
    details = InspectionResultDetailSerializer(many=True)
    inspected_by_username = serializers.CharField(source="inspected_by.username", read_only=True)
    judgment_display = serializers.CharField(source="get_judgment_display", read_only=True)

    class Meta:
        model = InspectionResult
        fields = [
            "id",
            "inspection_item",
            "inspected_at",
            "inspected_by",
            "inspected_by_username",
            "part_number",
            "lot_number",
            "serial_number",
            "related_order_type",
            "related_order_number",
            "quantity_inspected",
            "judgment",
            "judgment_display",
            "remarks",
            "attachment",
            "equipment_used",
            "details",
        ]
        read_only_fields = [
            "id",
            "inspected_at",
            "inspected_by",
            "inspected_by_username",
            "judgment",
            "judgment_display",
        ]

    @transaction.atomic
    def create(self, validated_data):
        details_data = validated_data.pop("details")
        validated_data["inspected_by"] = self.context["request"].user
        validated_data["judgment"] = compute_overall_judgment(details_data)
        inspection_result = InspectionResult.objects.create(**validated_data)
        for detail_data in details_data:
            InspectionResultDetail.objects.create(inspection_result=inspection_result, **detail_data)
        return inspection_result
