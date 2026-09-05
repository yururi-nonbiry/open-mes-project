from django.contrib import admin

from .models import BillOfMaterial, Customer, Item, Supplier, UnitCost, Warehouse, WarehouseLocation, WorkCenter

# Register your models here.


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "code",
        "item_type",
        "unit",
        "default_warehouse",
        "default_location",
        "provision_type",
        "created_at",
    )
    list_filter = ("item_type", "provision_type", "created_at")
    search_fields = ("name", "code", "default_warehouse", "default_location")


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("supplier_number", "name", "contact_person", "phone", "email", "created_at")
    search_fields = ("supplier_number", "name", "contact_person", "email")


admin.site.register(Warehouse)


@admin.register(WarehouseLocation)
class WarehouseLocationAdmin(admin.ModelAdmin):
    list_display = ("warehouse", "code", "name", "pos_x", "pos_y", "width", "height")
    list_filter = ("warehouse",)
    search_fields = ("code", "name", "warehouse__warehouse_number")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "created_at")
    search_fields = ("code", "name")


@admin.register(WorkCenter)
class WorkCenterAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "created_at")
    search_fields = ("code", "name")


@admin.register(UnitCost)
class UnitCostAdmin(admin.ModelAdmin):
    list_display = ("item", "cost", "updated_at")
    search_fields = ("item__code", "item__name")


@admin.register(BillOfMaterial)
class BillOfMaterialAdmin(admin.ModelAdmin):
    list_display = ("product", "material", "quantity", "updated_at")
    list_filter = ("product",)
    search_fields = ("product__code", "product__name", "material__code", "material__name")
