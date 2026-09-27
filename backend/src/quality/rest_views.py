import json

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from base.responses import error_response
from base.viewsets import CustomSuccessMessageMixin

from .models import InspectionItem, InspectionResult
from .serializers import (
    InspectionItemDetailSerializer,
    InspectionItemListSerializer,
    InspectionResultSerializer,
    MeasurementDetailSerializer,
)

# 検査結果登録フォームの動的な定義
# フロントエンドの InspectionResultModal.jsx で使用されます
INSPECTION_RESULT_FORM_FIELDS = [
    {"name": "part_number", "label": "品番", "type": "text"},
    {"name": "lot_number", "label": "ロット番号", "type": "text"},
    {"name": "equipment_used", "label": "使用設備", "type": "text"},
    # 'operator' はリクエストユーザーから自動的に設定するため、フォームには含めません
    {"name": "attachment", "label": "添付ファイル", "type": "file"},
    {"name": "remarks", "label": "備考", "type": "textarea"},
]


class InspectionItemViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    """
    API endpoint for Inspection Items (検査項目マスター).
    """

    queryset = InspectionItem.objects.prefetch_related("measurement_details").all().order_by("code")
    permission_classes = [permissions.IsAuthenticated]
    protected_error_message = (
        "この{model_name}(または削除しようとした測定詳細)は実績データが関連付けられているため削除できません。"
    )

    def get_serializer_class(self):
        if self.action == "list":
            return InspectionItemListSerializer
        return InspectionItemDetailSerializer

    @action(detail=True, methods=["get"], url_path="form-data")
    def form_data(self, request, pk=None):
        """
        検査結果モーダルのためのフォーム定義と測定詳細を返す
        """
        inspection_item = self.get_object()
        measurement_details = inspection_item.measurement_details.all().order_by("order")
        details_serializer = MeasurementDetailSerializer(measurement_details, many=True)
        return Response(
            {
                "result_form_fields": INSPECTION_RESULT_FORM_FIELDS,
                "measurement_details": details_serializer.data,
            }
        )

    @action(detail=True, methods=["post"], url_path="record-result")
    def record_result(self, request, pk=None):
        """
        検査結果を登録する
        """
        inspection_item = self.get_object()

        # フロントエンドはFormDataで送信し、詳細はJSON文字列で渡される
        try:
            measurement_payload = json.loads(request.data.get("measurement_details_payload", "[]"))
        except json.JSONDecodeError:
            return error_response("測定詳細のデータ形式が不正です。")

        # 各詳細の測定タイプを特定するために、MeasurementDetailオブジェクトを取得
        detail_ids = [d.get("measurement_detail_id") for d in measurement_payload]
        measurement_details_map = {
            str(md.id): md for md in inspection_item.measurement_details.filter(id__in=detail_ids)
        }

        details_data_for_serializer = []
        for measurement_data in measurement_payload:
            detail_id = measurement_data.get("measurement_detail_id")
            value = measurement_data.get("value")
            measurement_detail = measurement_details_map.get(detail_id)

            if not measurement_detail:
                return error_response(f"無効な測定詳細IDです: {detail_id}")

            detail_dict = {"measurement_detail": detail_id}
            if measurement_detail.measurement_type == "quantitative":
                detail_dict["measured_value_numeric"] = value if value not in [None, ""] else None
            else:  # qualitative
                detail_dict["result_qualitative"] = value if value not in [None, ""] else None
            details_data_for_serializer.append(detail_dict)

        # シリアライザ用のメインデータオブジェクトを構築
        result_data = {
            "inspection_item": inspection_item.id,
            "part_number": request.data.get("part_number"),
            "lot_number": request.data.get("lot_number"),
            "equipment_used": request.data.get("equipment_used"),
            "remarks": request.data.get("remarks"),
            "attachment": request.data.get("attachment"),
            "details": details_data_for_serializer,
        }

        # 入力値エラーは共通の例外ハンドラが統一形式の400に変換する
        serializer = InspectionResultSerializer(data=result_data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            {"message": f"検査項目「{inspection_item.name}」の結果を登録しました。"},
            status=status.HTTP_201_CREATED,
        )


class InspectionResultViewSet(CustomSuccessMessageMixin, viewsets.ModelViewSet):
    """
    API endpoint for Inspection Results (検査実績).
    """

    queryset = (
        InspectionResult.objects.all()
        .select_related("inspected_by", "inspection_item")
        .prefetch_related("details__measurement_detail")
        .order_by("-inspected_at")
    )
    serializer_class = InspectionResultSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_context(self):
        """
        Pass request context to the serializer.
        """
        return {"request": self.request}
