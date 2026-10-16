import os
import re
from getpass import getpass

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# MySQL names we put inside backticks must be plain, so nothing can break out of the quotes.
NAME_PATTERN = re.compile(r'^[A-Za-z0-9_]{1,64}$')
HOST_PATTERN = re.compile(r'^[A-Za-z0-9_.%:-]{1,255}$')


def validate_name(value, label):
    if not value or not NAME_PATTERN.match(value):
        raise CommandError(f'{label} must be 1-64 letters, digits or underscores (got {value!r}).')
    return value


def escape_grant_pattern(name):
    """In GRANT ... ON db.*, `_` and `%` are wildcards; escape them so only this exact database matches."""
    return name.replace('\\', '\\\\').replace('_', '\\_').replace('%', '\\%')


def build_statements(db_name, test_db_name, user, password, user_host):
    """The SQL to run as root: a list of (sql, params). Names are validated; the password is a parameter."""
    account = (user, user_host)
    return [
        (f'CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4', ()),
        ('CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s', (*account, password)),
        # Keep the password in step with .env even if the user already existed.
        ('ALTER USER %s@%s IDENTIFIED BY %s', (*account, password)),
        (f'GRANT ALL PRIVILEGES ON `{escape_grant_pattern(db_name)}`.* TO %s@%s', account),
        # Django's test runner creates and drops this database.
        (f'GRANT ALL PRIVILEGES ON `{escape_grant_pattern(test_db_name)}`.* TO %s@%s', account),
    ]


class Command(BaseCommand):
    help = (
        'Create the MySQL database and the app user from your .env settings, and grant that user '
        'all privileges on the database (and on the Django test database). Local / first-time setup only. '
        'The root password is asked for, or read from DB_ROOT_PASSWORD, and is never stored.'
    )

    # Django's system checks connect to the database as the app user - which this command creates.
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--root-user', default='root', help='MySQL admin account used for the setup (default: root).')
        parser.add_argument(
            '--user-host',
            default='localhost',
            help="Host part of the app user's account (default: localhost). Use %% to allow any host.",
        )

    def handle(self, *args, **options):
        config = settings.DATABASES['default']
        if 'mysql' not in config['ENGINE']:
            raise CommandError(f'DATABASES["default"] uses {config["ENGINE"]}, not MySQL. Nothing to set up.')

        db_name = validate_name(config['NAME'], 'DB_NAME')
        app_user = validate_name(config['USER'], 'DB_USER')
        test_db_name = validate_name(config.get('TEST', {}).get('NAME') or f'test_{db_name}', 'The test database name')
        app_password = config['PASSWORD']
        user_host = options['user_host']
        if not HOST_PATTERN.match(user_host):
            raise CommandError(f'--user-host looks invalid: {user_host!r}.')
        if app_user.lower() == 'root':
            raise CommandError('DB_USER must be a dedicated app user, not root.')
        if not app_password:
            raise CommandError('DB_PASSWORD is empty. Put the password you want the app user to have in .env first.')

        root_password = os.environ.get('DB_ROOT_PASSWORD') or getpass(f'MySQL password for {options["root_user"]}: ')

        import MySQLdb  # imported here so other commands work without the MySQL driver

        host = config.get('HOST') or '127.0.0.1'
        port = int(config.get('PORT') or 3306)
        try:
            connection = MySQLdb.connect(host=host, port=port, user=options['root_user'], passwd=root_password, charset='utf8mb4')
        except MySQLdb.OperationalError as error:
            code = error.args[0] if error.args else None
            if code == 1045:
                raise CommandError(f'MySQL refused the login for {options["root_user"]}@{host}:{port}. Check the root password.') from error
            raise CommandError(f'Cannot connect to MySQL at {host}:{port} ({error}). Check DB_HOST / DB_PORT and that the server is running.') from error

        try:
            with connection.cursor() as cursor:
                for sql, params in build_statements(db_name, test_db_name, app_user, app_password, user_host):
                    cursor.execute(sql, params)
            connection.commit()
        except MySQLdb.Error as error:
            raise CommandError(f'MySQL returned an error: {error}') from error
        finally:
            connection.close()

        self.stdout.write(self.style.SUCCESS(f'Database `{db_name}` is ready on {host}:{port}.'))
        self.stdout.write(f'User {app_user}@{user_host}: password set from .env, all privileges on `{db_name}` and `{test_db_name}`.')
        self.stdout.write('Next: py manage.py migrate')
