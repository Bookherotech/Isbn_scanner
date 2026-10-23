from book_admin.paginations.inventory_paginations import InventoryPagination


class ActivityPagination(InventoryPagination):
    """Same numbered pages as the book lists; the log screen asks for 30 per page and the CSV export for up to 5000."""

    page_size = 30
    max_page_size = 5000
