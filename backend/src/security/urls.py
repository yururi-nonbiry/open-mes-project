from django.urls import path

from . import views

app_name = "security_api"

urlpatterns = [
    path("access-logs/", views.AccessLogListView.as_view(), name="access-log-list"),
    path("access-logs/export/", views.AccessLogExportView.as_view(), name="access-log-export"),
    path("locks/", views.LockStatusView.as_view(), name="lock-status"),
    path("locks/users/<uuid:user_id>/unlock/", views.UnlockUserView.as_view(), name="unlock-user"),
    path("locks/ips/<int:pk>/unblock/", views.UnblockIpView.as_view(), name="unblock-ip"),
    path("captcha/", views.CaptchaView.as_view(), name="captcha"),
]
