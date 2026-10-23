"""The Reports screen. Counts come from the database; per-day buckets and the export lists are bounded by the date range."""


from django.db.models import Count, Q

from authentication.constants import Role
from authentication.models import User
from book_admin.serializers import ShelfSerializer
from book_admin.services.book_queries import shelves_with_stats
from book_admin.utils import count_by_day, display_name, last_days, start_of_day
from inventory.constants import BookStatus
from inventory.models import Book

LIST_LIMIT = 1000  # rows per export list


def _row(b):
    return {
        'id': b.id, 'title': b.title, 'author': b.author, 'isbn': b.isbn, 'shelf': b.shelf.code, 'quantity': b.quantity,
        'submitted_by': display_name(b.submitted_by), 'submitted_at': b.submitted_at,
    }


def build_report(days, shelf='', staff=None, status=''):
    day_list = last_days(days)
    since = start_of_day(day_list[0])
    scope = Q()
    if shelf:
        scope &= Q(shelf__code=shelf)
    if staff:
        scope &= Q(submitted_by_id=staff)
    if status:
        scope &= Q(status=status)
    scoped = Book.objects.filter(scope)

    def stamps(field):
        return list(scoped.filter(**{f'{field}__gte': since}).values_list(field, flat=True))

    added, approved, rejected = stamps('submitted_at'), stamps('approved_at'), stamps('rejected_at')
    series = [
        {'date': d, 'added': a, 'approved': p, 'rejected': r}
        for d, a, p, r in zip(day_list, count_by_day(added, day_list), count_by_day(approved, day_list), count_by_day(rejected, day_list))
    ]
    totals = {
        'added': len(added),
        'approved': len(approved),
        'rejected': len(rejected),
        'auto_rejected': scoped.filter(rejected_at__gte=since, auto_rejected=True).count(),
        'waiting': scoped.filter(status=BookStatus.WAITING).count(),
        'out_of_stock': scoped.filter(status=BookStatus.OUT_OF_STOCK).count(),
    }

    shelf_rows = shelves_with_stats()
    if shelf:
        shelf_rows = shelf_rows.filter(code=shelf)
    by_shelf = ShelfSerializer(sorted(shelf_rows, key=lambda s: -s.units), many=True).data

    mine = Q(submitted_books__submitted_at__gte=since)
    for key, value in (('submitted_books__shelf__code', shelf), ('submitted_books__status', status)):
        if value:
            mine &= Q(**{key: value})
    people = User.objects.filter(role=Role.STAFF).only('id', 'email', 'full_name', 'is_active')
    if staff:
        people = people.filter(id=staff)
    staff_rows = []
    for u in people.annotate(
        submitted=Count('submitted_books', filter=mine),
        approved=Count('submitted_books', filter=mine & Q(submitted_books__approved_at__isnull=False)),
        rejected=Count('submitted_books', filter=mine & Q(submitted_books__status=BookStatus.REJECTED)),
        waiting=Count('submitted_books', filter=mine & Q(submitted_books__status=BookStatus.WAITING)),
    ):
        decided = u.approved + u.rejected
        staff_rows.append({
            'id': u.id, 'name': display_name(u), 'is_active': u.is_active, 'submitted': u.submitted, 'approved': u.approved,
            'rejected': u.rejected, 'waiting': u.waiting, 'rate': round(u.approved / decided * 100) if decided else None,
        })
    staff_rows.sort(key=lambda r: -r['submitted'])

    reasons = (
        scoped.filter(status=BookStatus.REJECTED, rejected_at__gte=since).order_by().values('reject_reason')
        .annotate(count=Count('id')).order_by('-count')
    )

    joined = scoped.select_related('shelf', 'submitted_by')
    lists = {
        'added': [{**_row(b), 'status': b.status} for b in joined.filter(submitted_at__gte=since).order_by('-submitted_at')[:LIST_LIMIT]],
        'approved': [{**_row(b), 'approved_at': b.approved_at, 'product_id': b.product_id} for b in joined.filter(approved_at__gte=since).order_by('-approved_at')[:LIST_LIMIT]],
        'rejected': [
            {**_row(b), 'reason': b.reject_reason, 'by': 'System' if b.auto_rejected else display_name(b.rejected_by), 'rejected_at': b.rejected_at}
            for b in joined.select_related('rejected_by').filter(status=BookStatus.REJECTED, rejected_at__gte=since).order_by('-rejected_at')[:LIST_LIMIT]
        ],
        'waiting': [
            {**_row(b), 'current_shelf': b.linked_item.shelf.code if b.linked_item else None,
             'current_stock': b.linked_item.stock if b.linked_item else None,
             'ready': bool(b.linked_item and b.linked_item.status == BookStatus.OUT_OF_STOCK)}
            for b in joined.select_related('linked_item__shelf').filter(status=BookStatus.WAITING).order_by('submitted_at')[:LIST_LIMIT]
        ],
        'out_of_stock': [
            {**_row(b), 'stock_out_at': b.stock_out_at, 'waiting_entries': b.waiting_count}
            for b in joined.filter(status=BookStatus.OUT_OF_STOCK)
            .annotate(waiting_count=Count('waiting_entries', filter=Q(waiting_entries__status=BookStatus.WAITING))).order_by('-stock_out_at')[:LIST_LIMIT]
        ],
    }
    return {
        'series': series, 'totals': totals, 'by_shelf': by_shelf, 'staff_rows': staff_rows, 'lists': lists,
        'reasons': [{'reason': r['reject_reason'], 'count': r['count']} for r in reasons],
    }
