"""Writing the activity log and notifications. Called inside the same transaction as the change they describe."""

from book_admin.models import ActivityLog, Notification

Actor = ActivityLog.ActorType


def log_activity(*, action, kind, target='', detail='', result=ActivityLog.Result.SUCCESS, actor=None, actor_type=None, book=None):
    """One line in the Activity log. `actor` is a User; leave it out and pass actor_type=system/shopify for automatic events."""
    return ActivityLog.objects.create(
        actor=actor, actor_type=actor_type or (Actor.USER if actor else Actor.SYSTEM), action=action, kind=kind,
        target=target, detail=detail[:255], result=result, book=book,
    )


def notify(*, type, title, body, audience='', recipient=None, book=None, push=True):
    """A notification for an audience ('all' | 'admin' | 'staff') or, with `recipient`, for one person."""
    return Notification.objects.create(type=type, title=title, body=body[:500], audience=audience, recipient=recipient, book=book, push=push)


def quoted(book):
    return f'“{book.title}”'
