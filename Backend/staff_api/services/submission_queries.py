from inventory.models import Book


def my_submissions(user):
    """The user's own submissions, with every row the SubmissionSerializer reads joined in one query."""
    return Book.objects.filter(submitted_by=user).select_related(
        'shelf', 'linked_item__shelf', 'submitted_by', 'approved_by', 'rejected_by',
    )
