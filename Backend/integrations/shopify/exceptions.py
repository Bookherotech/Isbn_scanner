class ShopifyError(Exception):
    """Shopify could not do what we asked (network error, bad credentials, a GraphQL or user error)."""


class ProductGone(ShopifyError):
    """The book's Shopify product no longer exists (deleted in Shopify)."""


class ShopifyNotConfigured(ShopifyError):
    """SHOPIFY_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET / LOCATION_ID are not all set in .env."""
