from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from security import lockout
from security.models import IpBlock


class Command(BaseCommand):
    help = "ログイン失敗でブロックされたIPアドレスを解除します。"

    def add_arguments(self, parser):
        parser.add_argument("ip_addresses", nargs="*", help="解除するIPアドレス")
        parser.add_argument("--list", action="store_true", help="ブロック中のIPアドレスを一覧表示します")
        parser.add_argument("--all", action="store_true", help="すべてのIPアドレスのブロックを解除します")

    def handle(self, *args, **options):
        active = IpBlock.objects.filter(blocked_until__gt=timezone.now()).order_by("ip_address")
        if options["list"]:
            if not active:
                self.stdout.write("ブロック中のIPアドレスはありません。")
            for block in active:
                self.stdout.write(
                    f"{block.ip_address}\t{timezone.localtime(block.blocked_until):%Y-%m-%d %H:%M}まで"
                    f"\t失敗 {block.failure_count} 回"
                )
            return

        if options["all"]:
            blocks = list(active)
        elif options["ip_addresses"]:
            blocks = []
            for ip in options["ip_addresses"]:
                block = IpBlock.objects.filter(ip_address=ip).first()
                if block is None:
                    raise CommandError(f"IPアドレス {ip} のブロック情報はありません。")
                blocks.append(block)
        else:
            raise CommandError("解除するIPアドレス、--all、--list のいずれかを指定してください。")

        for block in blocks:
            if lockout.unblock_ip(block):
                self.stdout.write(self.style.SUCCESS(f"{block.ip_address} のブロックを解除しました。"))
            else:
                self.stdout.write(f"{block.ip_address} はブロックされていません。")
