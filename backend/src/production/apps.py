from django.apps import AppConfig


class ProductionConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "production"

    def ready(self):
        from . import signals  # noqa: F401  生産計画の所要部品を計画の作成・変更に追従させる
