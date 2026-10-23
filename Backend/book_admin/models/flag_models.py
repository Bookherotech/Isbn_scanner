from django.db import models

from book_admin.models.base_class_models import CreatedAtModel


class FlagCategory(CreatedAtModel):
    """An admin-defined content flag, e.g. "Graphic violence", matched against each book's subjects and title.

    Matching is done when books are read (see book_admin.services.flag_service), so a change to a category
    applies to every book at once. Whether an admin has reviewed a held book is kept on the book itself
    (inventory.Book.flag_reviewed_at / flag_reviewed_by / flag_note).
    """

    class Mode(models.TextChoices):
        HOLD = 'hold', 'Hold for review'  # a pending / waiting book waits in Needs review until an admin reviews it
        LABEL = 'label', 'Label only'  # the book is only tagged

    name = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=255, blank=True)
    keywords = models.JSONField(default=list)  # lower-case words or phrases, matched as whole words
    mode = models.CharField(max_length=5, choices=Mode.choices, default=Mode.HOLD)
    enabled = models.BooleanField(default=True)
    hue = models.PositiveSmallIntegerField(default=285)  # chip colour on the screens (0-359)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'admin_flag_categories'
        ordering = ['id']
        verbose_name_plural = 'flag categories'

    def __str__(self):
        return self.name
