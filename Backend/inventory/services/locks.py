"""A per-book lock, so the duplicate check and the insert of one book never run side by side."""

import hashlib
from contextlib import contextmanager

from django.db import connection

LOCK_WAIT_SECONDS = 10


class DuplicateCheckBusy(Exception):
    """The lock for this book could not be taken in time (another submission of it is still being saved)."""


@contextmanager
def duplicate_key_lock(key):
    """Hold a MySQL named lock for one duplicate key.

    Row locks are not enough: when nobody has the book yet there is no row to lock, so two staff
    submitting the same new book at once would both be saved as "pending". GET_LOCK is per
    connection, so it is released explicitly (it is not tied to the transaction).
    Other databases (none used today) get no lock.
    """
    if connection.vendor != 'mysql':
        yield
        return
    name = 'bookhero:dup:' + hashlib.sha1(key.encode('utf-8')).hexdigest()  # MySQL lock names: max 64 chars
    with connection.cursor() as cursor:
        cursor.execute('SELECT GET_LOCK(%s, %s)', [name, LOCK_WAIT_SECONDS])
        if cursor.fetchone()[0] != 1:
            raise DuplicateCheckBusy
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            cursor.execute('SELECT RELEASE_LOCK(%s)', [name])
