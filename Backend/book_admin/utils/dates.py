from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone


def store_tz():
    return ZoneInfo(settings.STORE_TIME_ZONE)


def store_today():
    """Today's date in the store's timezone (STORE_TIME_ZONE)."""
    return timezone.localtime(timezone.now(), store_tz()).date()


def start_of_day(day):
    """Midnight at the start of a store-local date, as an aware datetime."""
    return datetime.combine(day, time.min, tzinfo=store_tz())


def last_days(count):
    """The last `count` store-local dates, oldest first, ending today."""
    today = store_today()
    return [today - timedelta(days=count - 1 - i) for i in range(count)]


def count_by_day(timestamps, days):
    """Counts per store-local date for `days` (a list of dates), from an iterable of aware datetimes."""
    tz = store_tz()
    buckets = dict.fromkeys(days, 0)
    for stamp in timestamps:
        day = timezone.localtime(stamp, tz).date()
        if day in buckets:
            buckets[day] += 1
    return [buckets[day] for day in days]
