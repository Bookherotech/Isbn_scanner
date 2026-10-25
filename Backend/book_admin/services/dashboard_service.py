"""Numbers for the admin dashboard and the sidebar badges. A fixed handful of queries, however many books there are."""

from django.db.models import Count, Q, Sum
from django.utils import timezone

from book_admin.models import ActivityLog
from book_admin.serializers import ActivitySerializer, BookSerializer
from book_admin.services.book_queries import book_queryset
from book_admin.services.flag_service import load_categories, review_count, review_ids
from book_admin.utils import count_by_day, display_name, last_days, start_of_day, store_today
from authentication.constants import Role
from authentication.models import User
from inventory.constants import BookStatus, ShelfStatus
from inventory.models import Book, Shelf

STATUS_LABELS = [
    (BookStatus.LIVE, 'Live'), (BookStatus.PENDING, 'Pending'), (BookStatus.WAITING, 'Waiting list'),
    (BookStatus.OUT_OF_STOCK, 'Out of stock'), (BookStatus.REJECTED, 'Rejected'),
]
ATTENTION_PENDING = 3
ATTENTION_FLAGGED = 5
TOP_SHELVES = 8
RECENT_ACTIVITY = 9


def status_counts():
    """{status: count} — one GROUP BY read from the (status, submitted_at) index."""
    return dict(Book.objects.order_by().values_list('status').annotate(n=Count('id')))


def ready_count():
    """Books (not entries) with a waiting-list entry ready for approval - what the Waiting page lists."""
    return Book.objects.filter(status=BookStatus.WAITING, linked_item__status=BookStatus.OUT_OF_STOCK).values('duplicate_key').distinct().count()


def nav_counts():
    counts = status_counts()
    return {
        'pending': counts.get(BookStatus.PENDING, 0),
        'waiting': counts.get(BookStatus.WAITING, 0),
        'ready': ready_count(),
        'oos': counts.get(BookStatus.OUT_OF_STOCK, 0),
        'flagged': review_count(),
    }


def build_dashboard(request):
    days = last_days(7)
    since = start_of_day(days[0])
    today = start_of_day(store_today())
    counts = status_counts()

    live = Book.objects.filter(status=BookStatus.LIVE).aggregate(titles=Count('id'), units=Sum('stock'))
    added = count_by_day(Book.objects.filter(submitted_at__gte=since).values_list('submitted_at', flat=True), days)
    approved = count_by_day(Book.objects.filter(approved_at__gte=since).values_list('approved_at', flat=True), days)

    shelves = list(
        Book.objects.filter(status=BookStatus.LIVE).order_by().values('shelf__code')
        .annotate(units=Sum('stock'), titles=Count('id')).order_by('-units', 'shelf__code')[:TOP_SHELVES]
    )

    categories = load_categories()
    context = {'request': request, 'flag_categories': categories}
    attention_books = book_queryset()
    ready = attention_books.filter(status=BookStatus.WAITING, linked_item__status=BookStatus.OUT_OF_STOCK).order_by('submitted_at')
    failed = attention_books.filter(sync_status='failed', status__in=(BookStatus.LIVE, BookStatus.OUT_OF_STOCK)).order_by('-last_sync_at')
    held = attention_books.filter(id__in=review_ids(categories)).order_by('submitted_at', 'id')[:ATTENTION_FLAGGED]
    oldest = attention_books.filter(status=BookStatus.PENDING).order_by('submitted_at', 'id')[:ATTENTION_PENDING]

    staff_today = [
        {'id': u.id, 'name': display_name(u), 'submitted': u.submitted, 'approved': u.approved}
        for u in User.objects.filter(role=Role.STAFF, is_active=True).only('id', 'email', 'full_name').annotate(
            submitted=Count('submitted_books', filter=Q(submitted_books__submitted_at__gte=today)),
            approved=Count('submitted_books', filter=Q(submitted_books__approved_at__gte=today)),
        ).order_by('-submitted', 'full_name', 'id')
    ]

    ready_list = BookSerializer(ready, many=True, context=context).data
    return {
        'kpis': {
            'pending': counts.get(BookStatus.PENDING, 0),
            'waiting': counts.get(BookStatus.WAITING, 0),
            'ready': ready_count(),  # books, like the sidebar badge and the Waiting page
            'live_titles': live['titles'],
            'live_units': live['units'] or 0,
            'out_of_stock': counts.get(BookStatus.OUT_OF_STOCK, 0),
            'added_today': added[-1],
            'added_yesterday': added[-2],
            'approved_today': approved[-1],
        },
        'added7': [{'date': d, 'count': a, 'approved': p} for d, a, p in zip(days, added, approved)],
        'status': [{'key': key, 'label': label, 'count': counts.get(key, 0)} for key, label in STATUS_LABELS],
        'shelves': [{'shelf_id': s['shelf__code'], 'units': s['units'] or 0, 'titles': s['titles']} for s in shelves],
        'shelf_count': Shelf.objects.filter(status=ShelfStatus.ACTIVE).count(),
        'attention': {
            'ready': ready_list,
            'failed': BookSerializer(failed, many=True, context=context).data,
            'flagged': BookSerializer(held, many=True, context=context).data,
            'oldest_pending': BookSerializer(oldest, many=True, context=context).data,
        },
        'activity': ActivitySerializer(ActivityLog.objects.select_related('actor').order_by('-created_at', '-id')[:RECENT_ACTIVITY], many=True).data,
        'staff_today': staff_today,
        'now': timezone.now(),
    }
