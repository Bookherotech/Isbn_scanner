"""React to staff submissions without touching the staff or inventory code.

A new inventory.Book row is a submission (the staff app is the only thing that creates them). When one is saved,
the admins get a notification and the Activity log gets the matching lines. The signal fires inside the
submission's own transaction, so the notification and the book are saved together or not at all.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from book_admin.models import ActivityLog, Notification
from book_admin.services.activity_service import log_activity, notify, quoted
from book_admin.services.flag_service import load_categories, match_flags, needs_review
from inventory.constants import BookStatus
from inventory.models import Book


def _first_name(user):
    if user is None:
        return 'Someone'
    return (user.full_name.split() or [user.email.split('@')[0]])[0]


@receiver(post_save, sender=Book, dispatch_uid='book_admin.record_submission')
def record_submission(sender, instance, created, raw=False, **kwargs):
    if not created or raw:
        return
    book, name, who = instance, quoted(instance), _first_name(instance.submitted_by)
    K, R, A = ActivityLog.Kind, ActivityLog.Result, ActivityLog.ActorType
    log_activity(action='Submitted', kind=K.SUBMISSION, target=name, detail=f'Shelf {book.shelf.code} · qty {book.quantity}', actor=book.submitted_by, result=R.INFO, book=book)

    if book.status == BookStatus.REJECTED:  # the duplicate check refused it (same title + author already on that shelf)
        shelf = (book.match or {}).get('shelf_id', book.shelf.code)
        log_activity(action='Auto-rejected', kind=K.REJECTION, target=name, detail=f'Already on shelf {shelf} (title + author match)', actor_type=A.SYSTEM, result=R.ERROR, book=book)
        return

    if book.status == BookStatus.WAITING:
        shelf = (book.match or {}).get('shelf_id', '?')
        log_activity(action='Waiting list created', kind=K.WAITING, target=name, detail=f'{shelf} active · waiting on {book.shelf.code}', actor_type=A.SYSTEM, result=R.WARNING, book=book)
        notify(type=Notification.Type.WAITING_CREATED, title='Waiting-list entry', audience=Notification.Audience.ADMIN, book=book, push=False,
               body=f'{who} added {name} on {book.shelf.code}. Current stock is on {shelf}.')
        if book.waiting_ready_at:
            notify(type=Notification.Type.WAITING_READY, title='Waiting list ready', audience=Notification.Audience.ADMIN, book=book,
                   body=f'{book.title} is out of stock — the entry on {book.shelf.code} is ready for approval.')
    else:
        notify(type=Notification.Type.NEW_SUBMISSION, title='New submission', audience=Notification.Audience.ADMIN, book=book, push=False,
               body=f'{who} submitted {name} for review.')

    flags = match_flags(book.title, book.subjects, load_categories())
    if flags:
        hold = needs_review(book.status, book.flag_reviewed_at, flags)
        names = ', '.join(f['name'] for f in flags)
        log_activity(action='Flagged', kind=K.FLAG, target=name, detail=names, actor_type=A.SYSTEM, result=R.WARNING if hold else R.INFO, book=book)
        if hold:
            notify(type=Notification.Type.FLAGGED, title='Flagged for review', audience=Notification.Audience.ADMIN, book=book, body=f'{name} matches {names}.')
