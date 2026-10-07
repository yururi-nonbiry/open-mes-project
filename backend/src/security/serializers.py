from rest_framework import serializers

from .models import AccessLog, AccountLock, IpBlock


class AccessLogSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = AccessLog
        fields = [
            "id",
            "created_at",
            "event_type",
            "event_type_display",
            "user",
            "username",
            "ip_address",
            "user_agent",
            "method",
            "path",
            "status_code",
            "detail",
        ]


class AccountLockSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    custom_id = serializers.CharField(source="user.custom_id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    is_locked = serializers.SerializerMethodField()

    class Meta:
        model = AccountLock
        fields = [
            "id",
            "user_id",
            "custom_id",
            "username",
            "failure_count",
            "lock_level",
            "locked_until",
            "requires_admin_unlock",
            "is_locked",
            "last_failure_at",
        ]

    def get_is_locked(self, obj):
        return obj.is_locked(self.context.get("now"))


class IpBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = IpBlock
        fields = ["id", "ip_address", "blocked_until", "failure_count", "created_at", "updated_at"]
