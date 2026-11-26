"""Shared querysets and filters for the admin screens. Every queryset joins what its serializer reads, so a page costs a fixed number of queries."""

import re

from django.db import connection
from django.db.models import Count, Exists, OuterRef, Prefetch, Q, Sum
from django.db.models.expressions import RawSQL
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from book_admin.services.flag_service import held_pending_ids
from book_admin.services.rejection_reasons import REJECTION_REASONS
from inventory.constants import BookSource, BookStatus
from inventory.models import Book, Shelf
from inventory.services.fulltext import boolean_query, fulltext_ids_sql

BOOK_RELATED = ('shelf', 'previous_shelf', 'linked_item__shelf', 'submitted_by', 'approved_by', 'rejected_by', 'flag_reviewed_by')
STOCK_STATUSES = (BookStatus.LIVE, BookStatus.OUT_OF_STOCK)

SORTS = {
    'newest': ('-submitted_at', '-id'),
    'oldest': ('submitted_at', 'id'),
    'title': ('title', 'id'),
    'stock': ('stock', 'id'),
    'approved': ('-approved_at', '-id'),
    'rejected': ('-rejected_at', '-id'),
}


def book_queryset():
    return Book.objects.select_related(*BOOK_RELATED)


def with_open_waiting(queryset):
    """Adds `open_waiting` to each book: the waiting-list entries behind it, in the same two queries for the whole page."""
    waiting = Book.objects.filter(status=BookStatus.WAITING).select_related('shelf', 'submitted_by').order_by('submitted_at', 'id')
    return queryset.prefetch_related(Prefetch('waiting_entries', queryset=waiting, to_attr='open_waiting'))


def parse_statuses(value):
    if not value:
        return None
    statuses = [s.strip() for s in value.split(',') if s.strip()]
    bad = [s for s in statuses if s not in BookStatus.values]
    if bad:
        raise ValidationError({'status': f'Unknown status: {", ".join(bad)}. Use any of: {", ".join(BookStatus.values)}.'})
    return statuses


def _contains_filter(text, digits):
    """Title, author, shelf code, or (3+ digits) ISBN contains the text: reads every row (LIKE '%text%')."""
    cond = Q(title__icontains=text) | Q(author__icontains=text) | Q(shelf__code__icontains=text)
    if len(digits) >= 3:
        cond |= Q(isbn__icontains=digits)
    return cond


def search_filter(text):
    """Books matching the search box.

    Digits only (an ISBN or part of one): the ISBN contains them. Text: every word of the title / author (3+ letters)
    starts a word there ("atomic hab" finds "Atomic Habits"), through MySQL's FULLTEXT index (inventory.services.fulltext)
    instead of reading every row; a shelf code containing the text matches too. When the index finds no book (a word
    in the middle of another, a word under 3 letters only, books saved in a transaction that is still open, not MySQL),
    the old "contains" search is used.
    """
    text = (text or '').strip()
    if not text:
        return Q()
    digits = re.sub(r'\D', '', text)
    isbn_only = not re.search(r'[^\d\s-]', text)  # only digits (and spaces / dashes)
    if isbn_only and len(digits) == 13:
        return Q(isbn=digits)  # a full ISBN-13: the isbn index
    words = boolean_query(text)
    if words and connection.vendor == 'mysql':
        table = Book._meta.db_table
        sql, params = fulltext_ids_sql(), [words]
        shelf_ids = list(Shelf.objects.filter(code__icontains=text).values_list('id', flat=True)[:50])  # the shelf table is small
        if shelf_ids:
            sql += f' UNION SELECT id FROM {table} WHERE shelf_id IN ({", ".join(["%s"] * len(shelf_ids))})'
            params += shelf_ids
        if isbn_only and len(digits) >= 3:  # part of an ISBN, or a title like "1984"
            sql += f' UNION SELECT id FROM {table} WHERE isbn LIKE %s'
            params.append(f'%{digits}%')
        matched = Q(pk__in=RawSQL(sql, params))
        if Book.objects.filter(matched).exists():
            return matched
    return _contains_filter(text, digits)


def filter_books(queryset, params):
    """?status=a,b &q= &shelf=A-03 &staff=<id> &source= &author= &approved_only= &edited= &hide_held= &reason=<rejection reason> &sort=
    Books still on the Covers page (cover_hold) are left out: they join the lists once the admin sends them on."""
    queryset = queryset.filter(cover_hold=False)
    statuses = parse_statuses(params.get('status'))
    if statuses:
        queryset = queryset.filter(status__in=statuses)
    if params.get('approved_only', '').lower() == 'true':
        queryset = queryset.filter(approved_at__isnull=False)
    if params.get('edited', '').lower() == 'true':  # staff changed something from the fetched book
        queryset = queryset.exclude(edited_fields=[])
    if params.get('hide_held', '').lower() == 'true':
        queryset = queryset.exclude(id__in=held_pending_ids())
    queryset = queryset.filter(search_filter(params.get('q')))

    shelf = params.get('shelf', '').strip().upper()
    if shelf:
        queryset = queryset.filter(shelf__code=shelf)
    staff = params.get('staff')
    if staff:
        if not staff.isdigit():
            raise ValidationError({'staff': 'Must be a staff id.'})
        queryset = queryset.filter(submitted_by_id=int(staff))
    source = params.get('source')
    if source:
        if source not in BookSource.values:
            raise ValidationError({'source': f'Must be one of: {", ".join(BookSource.values)}.'})
        queryset = queryset.filter(source=source)
    author = params.get('author')
    if author:
        queryset = queryset.filter(author=author)
    reason = params.get('reason', '').strip()
    if reason:
        if reason not in REJECTION_REASONS:
            raise ValidationError({'reason': f'Must be one of: {", ".join(REJECTION_REASONS)}.'})
        queryset = queryset.filter(reject_reason=reason)

    sort = params.get('sort', 'newest')
    if sort not in SORTS:
        raise ValidationError({'sort': f'Must be one of: {", ".join(SORTS)}.'})
    return queryset.order_by(*SORTS[sort])


def shelves_with_stats():
    """Every shelf with its live books / units / waiting / pending counts, in one query.

    `used`: any book entry, in any status, is or was on this shelf; such a shelf cannot be deleted (only deactivated).
    """
    on_shopify = Q(books__status__in=STOCK_STATUSES)
    return Shelf.objects.annotate(
        used=Exists(Book.objects.filter(Q(shelf=OuterRef('pk')) | Q(previous_shelf=OuterRef('pk')))),
        titles=Count('books', filter=on_shopify),
        units=Coalesce(Sum('books__stock', filter=on_shopify), 0),
        waiting=Count('books', filter=Q(books__status=BookStatus.WAITING)),
        pending=Count('books', filter=Q(books__status=BookStatus.PENDING)),
    ).order_by('code')
