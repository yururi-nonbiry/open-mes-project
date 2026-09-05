from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .models import ApiTokenPolicy

CustomUser = get_user_model()

admin.site.register(CustomUser, UserAdmin)


@admin.register(ApiTokenPolicy)
class ApiTokenPolicyAdmin(admin.ModelAdmin):
    list_display = ("user", "is_active", "scopes", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("user__custom_id", "user__username")
