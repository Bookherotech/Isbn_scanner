"""Shared querysets and filters for the admin screens. Every queryset joins what its serializer reads, so a page costs a fixed number of queries."""

import re

from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from book_admin.services.rejection_reasons import REJECTION_REASONS
from inventory.constants import BookSource, BookStatus
from inventory.models import Book, Shelf

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


def search_filter(text):
    """Title, author, shelf code, or (3+ digits) ISBN contains the text."""
    text = (text or '').strip()
    if not text:
        return Q()
    cond = Q(title__icontains=text) | Q(author__icontains=text) | Q(shelf__code__icontains=text)
    digits = re.sub(r'\D', '', text)
    if len(digits) >= 3:
        cond |= Q(isbn__icontains=digits)
    return cond


def filter_books(queryset, params):
    """?status=a,b &q= &shelf=A-03 &staff=<id> &source= &author= &approved_only= &reason=<rejection reason> &sort="""
    statuses = parse_statuses(params.get('status'))
    if statuses:
        queryset = queryset.filter(status__in=statuses)
    if params.get('approved_only', '').lower() == 'true':
        queryset = queryset.filter(approved_at__isnull=False)
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
    """Every shelf with its live books / units / waiting / pending counts, in one query."""
    on_shopify = Q(books__status__in=STOCK_STATUSES)
    return Shelf.objects.annotate(
        titles=Count('books', filter=on_shopify),
        units=Coalesce(Sum('books__stock', filter=on_shopify), 0),
        waiting=Count('books', filter=Q(books__status=BookStatus.WAITING)),
        pending=Count('books', filter=Q(books__status=BookStatus.PENDING)),
    ).order_by('code')
