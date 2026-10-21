from django.core.cache import cache
from rest_framework.test import APITestCase

from authentication.constants import Role
from authentication.models import User
from authentication.services.token_service import issue_tokens
from authentication.tests.helpers import sign_in
from inventory.constants import BookStatus
from inventory.models import Book, Shelf
from inventory.services import duplicate_key

PASSWORD = 'pass-12345-xyz'


def make_book(user, shelf, title='The Great Gatsby', author='F. Scott Fitzgerald', status=BookStatus.PENDING, **fields):
    """A saved entry, with the duplicate key filled in like the real submission service does."""
    fields.setdefault('isbn', '9780141182636')
    fields.setdefault('quantity', 3)
    return Book.objects.create(
        title=title, author=author, status=status, shelf=shelf, submitted_by=user,
        duplicate_key=duplicate_key(title, author), **fields,
    )


class StaffApiTestCase(APITestCase):
    """Signed in as a Staff user, with shelves A-01, A-02 (active) and C-06 (inactive)."""

    def setUp(self):
        cache.clear()  # throttles and the metadata cache live in the cache
        self.staff = User.objects.create_user('sarah@bookhero.com', PASSWORD, full_name='Sarah Wilson')
        self.other_staff = User.objects.create_user('michael@bookhero.com', PASSWORD, full_name='Michael Brown')
        self.admin = User.objects.create_user('rachel@bookhero.com', PASSWORD, full_name='Rachel Morgan', role=Role.ADMIN)
        self.a01 = Shelf.objects.create(code='A-01')
        self.a02 = Shelf.objects.create(code='A-02')
        self.c06 = Shelf.objects.create(code='C-06', status='inactive')
        self.sign_in_as(self.staff)

    def sign_in_as(self, user):
        if user.role == Role.ADMIN:
            access = issue_tokens(user)['access']  # the admin login needs an emailed code: same tokens, issued directly
        else:
            access = sign_in(self.client, user.email, PASSWORD).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
