from types import SimpleNamespace
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase

from authentication.management.commands import setup_database
from authentication.management.commands.setup_database import build_statements, escape_grant_pattern, validate_name

MYSQL = {
    'ENGINE': 'django.db.backends.mysql',
    'NAME': 'bookhero',
    'USER': 'bookhero',
    'PASSWORD': 'app-secret-pw',
    'HOST': '127.0.0.1',
    'PORT': '3307',
}


def fake_settings(**overrides):
    return SimpleNamespace(DATABASES={'default': {**MYSQL, **overrides}})


class BuildStatementsTests(SimpleTestCase):
    def test_statements_create_db_user_and_grants(self):
        statements = build_statements('bookhero', 'test_bookhero', 'bookhero', 'pw', 'localhost')
        sqls = [sql for sql, _ in statements]
        self.assertEqual(sqls[0], 'CREATE DATABASE IF NOT EXISTS `bookhero` CHARACTER SET utf8mb4')
        self.assertIn('CREATE USER IF NOT EXISTS', sqls[1])
        self.assertIn('ALTER USER', sqls[2])
        self.assertIn('GRANT ALL PRIVILEGES ON `bookhero`.*', sqls[3])
        self.assertIn('GRANT ALL PRIVILEGES ON `test\\_bookhero`.*', sqls[4])  # underscore escaped

    def test_password_is_a_parameter_never_in_the_sql_text(self):
        for sql, params in build_statements('bookhero', 'test_bookhero', 'bookhero', 'top-secret', 'localhost'):
            self.assertNotIn('top-secret', sql)
        self.assertEqual(build_statements('a', 'test_a', 'u', 'top-secret', 'localhost')[1][1], ('u', 'localhost', 'top-secret'))

    def test_escape_grant_pattern(self):
        self.assertEqual(escape_grant_pattern('test_book_hero'), 'test\\_book\\_hero')
        self.assertEqual(escape_grant_pattern('a%b'), 'a\\%b')

    def test_validate_name_rejects_injection(self):
        for bad in ['', 'bookhero`; DROP DATABASE x; --', 'book hero', 'a' * 65, None]:
            with self.assertRaises(CommandError):
                validate_name(bad, 'DB_NAME')
        self.assertEqual(validate_name('book_hero2', 'DB_NAME'), 'book_hero2')


class SetupDatabaseCommandTests(SimpleTestCase):
    def run_command(self, settings_obj, root_password='root-pw', **options):
        connect = mock.MagicMock()
        with (
            mock.patch.object(setup_database, 'settings', settings_obj),
            mock.patch.dict('os.environ', {'DB_ROOT_PASSWORD': root_password}),
            mock.patch('MySQLdb.connect', connect),
        ):
            call_command('setup_database', **options)
        return connect

    def test_runs_every_statement_as_root_and_commits(self):
        connect = self.run_command(fake_settings())
        kwargs = connect.call_args.kwargs
        self.assertEqual((kwargs['host'], kwargs['port'], kwargs['user'], kwargs['passwd']), ('127.0.0.1', 3307, 'root', 'root-pw'))
        connection = connect.return_value
        cursor = connection.cursor.return_value.__enter__.return_value
        self.assertEqual(cursor.execute.call_count, 5)
        executed = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(executed[0].startswith('CREATE DATABASE IF NOT EXISTS `bookhero`'))
        connection.commit.assert_called_once()
        connection.close.assert_called_once()

    def test_custom_root_user_and_user_host(self):
        connect = self.run_command(fake_settings(), root_user='admin', user_host='%')
        self.assertEqual(connect.call_args.kwargs['user'], 'admin')
        cursor = connect.return_value.cursor.return_value.__enter__.return_value
        self.assertEqual(cursor.execute.call_args_list[1].args[1], ('bookhero', '%', 'app-secret-pw'))

    def test_does_not_run_system_checks_which_need_the_app_user(self):
        # The checks open a connection as DB_USER, which does not exist before this command runs.
        self.assertFalse(setup_database.Command.requires_system_checks)

    def test_refuses_non_mysql_engine(self):
        with self.assertRaisesMessage(CommandError, 'not MySQL'):
            self.run_command(fake_settings(ENGINE='django.db.backends.sqlite3'))

    def test_refuses_root_as_app_user(self):
        with self.assertRaisesMessage(CommandError, 'not root'):
            self.run_command(fake_settings(USER='root'))

    def test_refuses_empty_app_password(self):
        with self.assertRaisesMessage(CommandError, 'DB_PASSWORD is empty'):
            self.run_command(fake_settings(PASSWORD=''))

    def test_rejects_unsafe_database_name(self):
        with self.assertRaises(CommandError):
            self.run_command(fake_settings(NAME='bookhero`; DROP DATABASE mysql; --'))
