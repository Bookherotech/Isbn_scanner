"""Shopify Admin GraphQL API: https://shopify.dev/docs/api/admin-graphql

Auth is the client credentials grant (Dev Dashboard app installed on our own store): the Client ID and secret
are swapped for an access token that lasts 24 h. It is cached and fetched again shortly before it expires.
"""

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache

from integrations.shopify.exceptions import ShopifyError, ShopifyNotConfigured

logger = logging.getLogger(__name__)

TOKEN_CACHE_KEY = 'shopify:access-token'
TOKEN_EARLY_SECONDS = 10 * 60  # fetch a new token this long before the old one expires


def store_domain():
    """'bookhero.myshopify.com' from SHOPIFY_STORE_DOMAIN, with any https:// or trailing / removed."""
    domain = settings.SHOPIFY_STORE_DOMAIN.strip().lower()
    for prefix in ('https://', 'http://'):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    return domain.strip('/')


def location_gid():
    """SHOPIFY_LOCATION_ID as a GID: the number from the admin URL, or the full gid://shopify/Location/..."""
    value = settings.SHOPIFY_LOCATION_ID.strip()
    return value if value.startswith('gid://') else f'gid://shopify/Location/{value}'


def is_configured():
    return all((settings.SHOPIFY_STORE_DOMAIN, settings.SHOPIFY_CLIENT_ID, settings.SHOPIFY_CLIENT_SECRET, settings.SHOPIFY_LOCATION_ID))


def _post(url, body, headers):
    """POST and return the parsed JSON. HTTP errors come back as (status, parsed body) so callers can read Shopify's message."""
    request = Request(url, data=body, headers={'Accept': 'application/json', **headers}, method='POST')
    try:
        with urlopen(request, timeout=settings.SHOPIFY_TIMEOUT_SECONDS) as response:  # noqa: S310 - our store's https URL only
            return response.status, json.loads(response.read().decode('utf-8'))
    except HTTPError as error:
        try:
            data = json.loads(error.read().decode('utf-8'))
        except ValueError:
            data = {}
        return error.code, data
    except (URLError, TimeoutError, OSError, ValueError) as error:
        raise ShopifyError(f'Cannot reach Shopify: {error}') from error


def _fetch_token():
    status, data = _post(
        f'https://{store_domain()}/admin/oauth/access_token',
        urlencode({'grant_type': 'client_credentials', 'client_id': settings.SHOPIFY_CLIENT_ID, 'client_secret': settings.SHOPIFY_CLIENT_SECRET}).encode(),
        {'Content-Type': 'application/x-www-form-urlencoded'},
    )
    token = data.get('access_token') if status == 200 else None
    if not token:
        reason = data.get('error_description') or data.get('error') or f'HTTP {status}'
        if data.get('error') == 'shop_not_permitted':
            reason = 'the store is not in the same Shopify organization as the app'
        raise ShopifyError(f'Shopify refused the Client ID / secret: {reason}')
    lifetime = int(data.get('expires_in') or 86399)
    cache.set(TOKEN_CACHE_KEY, token, max(lifetime - TOKEN_EARLY_SECONDS, 60))
    return token


def access_token(refresh=False):
    if not is_configured():
        raise ShopifyNotConfigured('Shopify is not set up: add the SHOPIFY_* values to .env.')
    token = None if refresh else cache.get(TOKEN_CACHE_KEY)
    return token or _fetch_token()


def graphql(query, variables=None):
    """Run one Admin API query / mutation and return its `data`. Raises ShopifyError on any error.

    A 401 means the cached token was revoked: a new one is fetched and the call tried once more.
    userErrors inside `data` are left to the caller (they differ per mutation).
    """
    url = f'https://{store_domain()}/admin/api/{settings.SHOPIFY_API_VERSION}/graphql.json'
    body = json.dumps({'query': query, 'variables': variables or {}}).encode('utf-8')
    for attempt in (1, 2):
        token = access_token(refresh=attempt == 2)
        status, data = _post(url, body, {'Content-Type': 'application/json', 'X-Shopify-Access-Token': token})
        if status == 401 and attempt == 1:
            cache.delete(TOKEN_CACHE_KEY)
            continue
        break
    if status != 200:
        raise ShopifyError(f'Shopify API error (HTTP {status}): {data.get("errors") or data}')
    if data.get('errors'):
        messages = '; '.join(str(e.get('message', e)) for e in data['errors'])
        raise ShopifyError(f'Shopify API error: {messages}')
    return data.get('data') or {}


def put_file(url, raw, headers):
    """PUT file bytes to a staged upload URL. Raises ShopifyError on failure."""
    request = Request(url, data=raw, headers={'Content-Type': 'image/jpeg', **headers}, method='PUT')
    try:
        with urlopen(request, timeout=settings.SHOPIFY_TIMEOUT_SECONDS):  # noqa: S310 - the https URL Shopify returned
            return
    except HTTPError as error:
        raise ShopifyError(f'Shopify refused the image upload (HTTP {error.code}).') from error
    except (URLError, TimeoutError, OSError) as error:
        raise ShopifyError(f'Could not upload the image to Shopify: {error}') from error


def raise_user_errors(result):
    """A mutation's userErrors -> ShopifyError (no-op when there are none)."""
    errors = (result or {}).get('userErrors') or []
    if errors:
        raise ShopifyError('; '.join(e.get('message', '') for e in errors))
