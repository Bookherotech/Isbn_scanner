from rest_framework.pagination import CursorPagination


class UserCursorPagination(CursorPagination):
    """Keyset pagination on the primary key: constant cost on any page, no COUNT(*) and no OFFSET."""

    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
    ordering = '-id'
