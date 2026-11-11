from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import rest_views

app_name = "master_api"

router = DefaultRouter()
router.register(r"items", rest_views.ItemViewSet, basename="item")
router.register(r"suppliers", rest_views.SupplierViewSet, basename="supplier")
router.register(r"warehouses", rest_views.WarehouseViewSet, basename="warehouse")
router.register(r"warehouse-locations", rest_views.WarehouseLocationViewSet, basename="warehouse-location")
router.register(r"stock-purposes", rest_views.StockPurposeViewSet, basename="stock-purpose")
router.register(r"customers", rest_views.CustomerViewSet, basename="customer")
router.register(r"work-centers", rest_views.WorkCenterViewSet, basename="work-center")
router.register(r"unit-costs", rest_views.UnitCostViewSet, basename="unit-cost")
router.register(r"bill-of-materials", rest_views.BillOfMaterialViewSet, basename="bill-of-material")
router.register(r"work-calendar-days", rest_views.WorkCalendarDayViewSet, basename="work-calendar-day")

urlpatterns = [
    path("work-calendar-settings/", rest_views.WorkCalendarSettingView.as_view(), name="work-calendar-settings"),
    path("", include(router.urls)),
]
