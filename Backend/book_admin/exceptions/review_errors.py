from rest_framework import status
from rest_framework.exceptions import APIException


class ReviewError(APIException):
    """Base for admin review problems. The response body is {detail, code, ...extra} (same shape as the staff and auth errors)."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'This could not be done.'
    default_code = 'review_error'

    def __init__(self, detail=None, **extra):
        super().__init__(detail=detail or self.default_detail)
        # Plain dict on purpose: DRF would turn extra values (such as a nested match) into strings.
        self.detail = {'detail': str(self.detail), 'code': self.default_code, **extra}


class BookNotFound(ReviewError):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'This book could not be found. It may have been removed.'
    default_code = 'not_found'


class InvalidState(ReviewError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'This book is no longer in the right state for that.'
    default_code = 'invalid_state'


class NotReady(ReviewError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'The current stock has not sold out yet.'
    default_code = 'not_ready'


class DuplicateSameShelf(ReviewError):
    """An edit would put the book on a shelf that already holds the same title + author. `match` is the entry in the way."""

    status_code = status.HTTP_409_CONFLICT
    default_code = 'duplicate_same_shelf'


class ReviewBusy(ReviewError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Another change to this book is being saved. Please try again.'
    default_code = 'busy'
