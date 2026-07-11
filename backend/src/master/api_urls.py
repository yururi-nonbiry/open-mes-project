from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import rest_views

app_name = "master_api"

router = DefaultRouter()
router.register(r"items", rest_views.ItemViewSet, basename="item")
router.register(r"suppliers", rest_views.SupplierViewSet, basename="supplier")
router.register(r"warehouses", rest_views.WarehouseViewSet, basename="warehouse")
router.register(r"customers", rest_views.CustomerViewSet, basename="customer")
router.register(r"work-centers", rest_views.WorkCenterViewSet, basename="work-center")
router.register(r"unit-costs", rest_views.UnitCostViewSet, basename="unit-cost")

urlpatterns = [
    path("", include(router.urls)),
]
