from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from security import lockout
from security.models import AccountLock


class Command(BaseCommand):
    help = "ログイン失敗でロックされたアカウントを解除します。"

    def add_arguments(self, parser):
        parser.add_argument("custom_ids", nargs="*", help="解除するユーザーのID(ログインID)")
        parser.add_argument("--list", action="store_true", help="ロック状態のアカウントを一覧表示します")
        parser.add_argument("--all", action="store_true", help="すべてのアカウントのロックを解除します")

    def handle(self, *args, **options):
        now = timezone.now()
        if options["list"]:
            locks = AccountLock.objects.select_related("user").order_by("user__custom_id")
            if not locks:
                self.stdout.write("ロック情報のあるアカウントはありません。")
            for lock in locks:
                if lock.requires_admin_unlock:
                    state = "ロック中(管理者による解除が必要)"
                elif lock.is_locked(now):
                    state = f"ロック中({timezone.localtime(lock.locked_until):%Y-%m-%d %H:%M}まで)"
                else:
                    state = "ロックなし"
                self.stdout.write(
                    f"{lock.user.custom_id}\t{state}\t連続失敗 {lock.failure_count} 回\tロック段階 {lock.lock_level}"
                )
            return

        if options["all"]:
            users = [lock.user for lock in AccountLock.objects.select_related("user")]
        elif options["custom_ids"]:
            User = get_user_model()
            users = []
            for custom_id in options["custom_ids"]:
                try:
                    users.append(User.objects.get_by_natural_key(custom_id))
                except User.DoesNotExist:
                    raise CommandError(f"ユーザー {custom_id} は存在しません。") from None
        else:
            raise CommandError("解除するユーザーのID、--all、--list のいずれかを指定してください。")

        for user in users:
            if lockout.unlock_user(user):
                self.stdout.write(self.style.SUCCESS(f"{user.custom_id} のロックを解除しました。"))
            else:
                self.stdout.write(f"{user.custom_id} はロックされていません。")
