from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

User = get_user_model()


class UserManagerTests(TestCase):
    """USR-MGR-* : UserManager.create_user / create_superuser。"""

    def test_usr_mgr_01_create_user_requires_custom_id(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(custom_id="", password="pw12345")

    def test_usr_mgr_02_create_user_defaults_not_staff_not_superuser(self):
        user = User.objects.create_user(custom_id="plainuser", password="pw12345")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_usr_mgr_03_create_superuser_success(self):
        user = User.objects.create_superuser(custom_id="rootuser", password="pw12345")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_usr_mgr_04_create_superuser_rejects_is_staff_false(self):
        with self.assertRaises(ValueError):
            User.objects.create_superuser(custom_id="rootuser", password="pw12345", is_staff=False)

    def test_usr_mgr_05_create_superuser_rejects_is_superuser_false(self):
        with self.assertRaises(ValueError):
            User.objects.create_superuser(custom_id="rootuser", password="pw12345", is_superuser=False)


class CustomUserModelTests(TestCase):
    """USR-MODEL-* : CustomUser のプロパティ・メソッド。"""

    def setUp(self):
        self.user = User.objects.create_user(
            custom_id="modeluser", password="pw12345", first_name="太郎", last_name="山田"
        )

    def test_usr_model_01_str_returns_custom_id(self):
        self.assertEqual(str(self.user), "modeluser")

    def test_usr_model_02_get_full_name(self):
        self.assertEqual(self.user.get_full_name(), "太郎 山田")

    def test_usr_model_03_get_short_name(self):
        self.assertEqual(self.user.get_short_name(), "太郎")

    def test_usr_model_04_save_normalizes_empty_email_to_none(self):
        self.user.email = ""
        self.user.save()
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email)

    def test_usr_model_05_save_normalizes_email_domain_case(self):
        self.user.email = "Someone@EXAMPLE.com"
        self.user.save()
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "Someone@example.com")

    def test_usr_model_06_set_password_updates_password_last_changed_only_after_save(self):
        old_changed = self.user.password_last_changed
        self.user.set_password("newpw12345")
        # set_password はインメモリで password_last_changed を更新するのみで、保存はしない仕様。
        self.user.refresh_from_db()
        self.assertEqual(self.user.password_last_changed, old_changed)

        self.user.set_password("newpw12345")
        self.user.save(update_fields=["password", "password_last_changed"])
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.password_last_changed, old_changed)
        self.assertTrue(self.user.check_password("newpw12345"))

    @override_settings(PASSWORD_EXPIRATION_DAYS=180)
    def test_usr_model_07_is_password_expired_true_when_old(self):
        self.user.password_last_changed = timezone.now() - timedelta(days=200)
        self.assertTrue(self.user.is_password_expired)

    @override_settings(PASSWORD_EXPIRATION_DAYS=180)
    def test_usr_model_08_is_password_expired_false_when_recent(self):
        self.user.password_last_changed = timezone.now() - timedelta(days=10)
        self.assertFalse(self.user.is_password_expired)

    @override_settings(PASSWORD_EXPIRATION_DAYS=None)
    def test_usr_model_09_is_password_expired_false_when_disabled(self):
        self.user.password_last_changed = timezone.now() - timedelta(days=10000)
        self.assertFalse(self.user.is_password_expired)

    @override_settings(PASSWORD_EXPIRATION_DAYS=180)
    def test_usr_model_10_is_password_expired_true_when_last_changed_missing(self):
        self.user.password_last_changed = None
        self.assertTrue(self.user.is_password_expired)
