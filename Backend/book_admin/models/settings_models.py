from django.db import models


class AppSettings(models.Model):
    """The store's settings: one row (id 1), read with AppSettings.load()."""

    store_name = models.CharField(max_length=120, default='BookHero Store')
    store_domain = models.CharField(max_length=255, blank=True)  # e.g. bookhero.myshopify.com
    store_location = models.CharField(max_length=120, blank=True)  # the Shopify inventory location the stock is read from
    shopify_connected = models.BooleanField(default=False)  # no Shopify integration yet: stays off until one exists
    stock_poll_minutes = models.PositiveSmallIntegerField(default=10)  # how often the stock check runs
    reminder_after_hours = models.PositiveSmallIntegerField(default=24)  # push #2 if still out of stock after this long
    last_stock_check_at = models.DateTimeField(null=True, blank=True)  # set by the stock check
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'admin_settings'
        verbose_name_plural = 'app settings'

    def __str__(self):
        return self.store_name

    @classmethod
    def load(cls):
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings

    def save(self, *args, **kwargs):
        self.pk = 1  # a second row would make "the settings" ambiguous
        super().save(*args, **kwargs)
