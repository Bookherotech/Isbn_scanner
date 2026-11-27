"""A book's selling price in AED, as staff and admins type it."""

import re
from decimal import Decimal

MAX_PRICE = Decimal('999999.99')  # Book.price: 8 digits, 2 after the point


class InvalidPrice(ValueError):
    pass


def clean_price(value):
    """'' / None -> None; '45', '45.5', '45.50' or 45 -> Decimal('45.50') (always 2 decimals, so '45' and '45.00' are
    the same price); anything else (letters, a minus, 0, 3+ decimals, too big) -> InvalidPrice."""
    text = '' if value is None else str(value).strip()
    if text == '':
        return None
    if not re.fullmatch(r'\d{1,6}(\.\d{1,2})?', text):
        raise InvalidPrice('Enter a price in AED, e.g. 45 or 45.50.')
    price = Decimal(text).quantize(Decimal('0.01'))
    if price <= 0:
        raise InvalidPrice('The price must be more than 0.')
    return price
