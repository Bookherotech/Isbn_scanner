"""Shopify webhooks: Shopify tells us the moment stock changes or a product is deleted, instead of waiting for the
scheduled stock check (which keeps running as the backup, since a delivery can be missed).

Topics: inventory_levels/update (sold out / restocked) and products/delete. Subscriptions are made once per site with
register_webhooks('https://<site>'); they need a public HTTPS address.
"""

import base64
import hashlib
import hmac
import logging

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from integrations.shopify.client import graphql, location_gid, raise_user_errors, store_domain
from integrations.shopify.products import numeric_id
from integrations.shopify.sync import DELETED, NEEDS_PUSH, STOCK_STATUSES, _apply_stock, _mark_deleted
from inventory.models import Book

logger = logging.getLogger(__name__)

PATH = '/api/shopify/webhook/'
TOPICS = {'INVENTORY_LEVELS_UPDATE': 'inventory_levels/update', 'PRODUCTS_DELETE': 'products/delete'}
SEEN_SECONDS = 24 * 60 * 60  # Shopify retries a delivery for up to 4 hours
ITEM_CACHE_SECONDS = 7 * 24 * 60 * 60


def signature_ok(raw_body, header):
    """True when the X-Shopify-Hmac-Sha256 header matches the body, signed with the app's Client secret."""
    if not header or not settings.SHOPIFY_CLIENT_SECRET:
        return False
    digest = hmac.new(settings.SHOPIFY_CLIENT_SECRET.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), header.strip())


def from_our_store(shop_domain):
    return (shop_domain or '').strip().lower() == store_domain()


def first_delivery(webhook_id):
    """False when this delivery was already handled (Shopify retries, and may deliver twice)."""
    return not webhook_id or cache.add(f'shopify:webhook:{webhook_id}', 1, SEEN_SECONDS)


ITEM_QUERY = """
query ItemProduct($id: ID!) {
  inventoryItem(id: $id) { variant { product { id } } }
}
"""


def _product_of_item(inventory_item_id):
    """The numeric product id an inventory item belongs to (cached: it never changes), or None."""
    key = f'shopify:item-product:{inventory_item_id}'
    product_id = cache.get(key)
    if product_id is None:
        item = graphql(ITEM_QUERY, {'id': f'gid://shopify/InventoryItem/{inventory_item_id}'})['inventoryItem']
        variant = (item or {}).get('variant')
        if not variant:
            return None
        product_id = numeric_id(variant['product']['id'])
        cache.set(key, product_id, ITEM_CACHE_SECONDS)
    return product_id


def _tracked_books(product_id):
    """Books whose stock this product holds: live or out of stock, pushed already, not marked deleted."""
    return Book.objects.filter(product_id=str(product_id), status__in=STOCK_STATUSES).exclude(NEEDS_PUSH).exclude(sync_status=DELETED)


def stock_changed(payload):
    """inventory_levels/update -> sold out / restocked / new count, for our location only. -> books changed."""
    if str(payload.get('location_id')) != numeric_id(location_gid()) or payload.get('available') is None:
        return 0
    product_id = _product_of_item(payload['inventory_item_id'])
    if product_id is None:
        return 0
    now = timezone.now()
    ids = list(_tracked_books(product_id).values_list('id', flat=True))
    for book_id in ids:
        _apply_stock(book_id, max(int(payload['available']), 0), now)
    return len(ids)


def product_deleted(payload):
    """products/delete -> the books on it become "Deleted on Shopify". -> books changed."""
    now = timezone.now()
    return sum(_mark_deleted(book_id, now) for book_id in _tracked_books(payload.get('id')).values_list('id', flat=True))


HANDLERS = {'inventory_levels/update': stock_changed, 'products/delete': product_deleted}


def handle(topic, payload):
    handler = HANDLERS.get(topic)
    return handler(payload) if handler else 0


LIST_QUERY = """
query Subscriptions {
  webhookSubscriptions(first: 50) { edges { node { id topic uri } } }
}
"""

CREATE_MUTATION = """
mutation Subscribe($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}
"""

DELETE_MUTATION = """
mutation Unsubscribe($id: ID!) {
  webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } }
}
"""


def _address(site_url):
    return site_url.rstrip('/') + PATH


def list_webhooks():
    """[{id, topic, uri}] subscribed by this app on the store."""
    return [e['node'] for e in graphql(LIST_QUERY)['webhookSubscriptions']['edges']]


def register_webhooks(site_url):
    """Subscribe `site_url` (e.g. https://test.bookhero.cresterix.com) to both topics; already-subscribed ones are kept.
    -> {topic: 'created' | 'exists'}"""
    uri = _address(site_url)
    if not uri.startswith('https://'):
        raise ValueError('Shopify only sends webhooks to an https:// address.')
    existing = {(w['topic'], w['uri']) for w in list_webhooks()}
    result = {}
    for topic in TOPICS:
        if (topic, uri) in existing:
            result[topic] = 'exists'
            continue
        created = graphql(CREATE_MUTATION, {'topic': topic, 'webhookSubscription': {'uri': uri}})['webhookSubscriptionCreate']
        raise_user_errors(created)
        result[topic] = 'created'
    return result


def unregister_webhooks(site_url):
    """Remove this app's subscriptions to `site_url`. -> how many were removed."""
    uri = _address(site_url)
    removed = 0
    for w in list_webhooks():
        if w['uri'] == uri:
            raise_user_errors(graphql(DELETE_MUTATION, {'id': w['id']})['webhookSubscriptionDelete'])
            removed += 1
    return removed
