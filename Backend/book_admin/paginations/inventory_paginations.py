from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class InventoryPagination(PageNumberPagination):
    """Numbered pages ({results, total, page, pages, page_size}): the admin tables show "page 2 of 7"."""

    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 500

    def get_paginated_response(self, data):
        return Response({
            'results': data,
            'total': self.page.paginator.count,
            'page': self.page.number,
            'pages': self.page.paginator.num_pages,
            'page_size': self.get_page_size(self.request),
        })
