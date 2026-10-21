from rest_framework import status
from rest_framework.exceptions import APIException


class IsbnLookupError(APIException):
    """Base for ISBN lookup problems. The response body is {detail, code} (same shape as the auth errors)."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Could not look up this ISBN.'
    default_code = 'lookup_error'

    def __init__(self, detail=None):
        super().__init__(detail=detail or self.default_detail)
        self.detail = {'detail': str(self.detail), 'code': self.default_code}


class InvalidIsbn(IsbnLookupError):
    default_detail = 'This is not a valid ISBN. Check the number on the book.'
    default_code = 'invalid_isbn'


class SubmissionBusy(IsbnLookupError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Another submission of this book is being saved. Please try again.'
    default_code = 'busy'


class TitleTooShort(IsbnLookupError):
    default_detail = 'Type at least 3 letters of the title.'
    default_code = 'title_too_short'


class IsbnNotFound(IsbnLookupError):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'No record for this ISBN in Google Books or Open Library.'
    default_code = 'not_found'


class MetadataServiceUnavailable(IsbnLookupError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Google Books and Open Library did not respond.'
    default_code = 'service_unavailable'
