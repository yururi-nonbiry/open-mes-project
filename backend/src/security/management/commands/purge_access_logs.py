from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from security.audit import purge_expired


class Command(BaseCommand):
    help = "保存期間を過ぎたアクセスログと、期限切れのIPブロック・CAPTCHAを削除します。"

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help=f"保存日数(省略時は ACCESS_LOG_RETENTION_DAYS={settings.ACCESS_LOG_RETENTION_DAYS})",
        )

    def handle(self, *args, **options):
        days = options["days"]
        if days is not None and days < 1:
            raise CommandError("--days には1以上を指定してください。")
        deleted = purge_expired(days)
        self.stdout.write(self.style.SUCCESS(f"アクセスログを {deleted} 件削除しました。"))
