"""POST /api/shopify/webhook/ - where Shopify delivers webhooks. Checked, answered at once, then handled in the background:
Shopify gives up after 5 seconds and retries, so the slow part (a Shopify lookup) must not hold the response."""

import json
import logging
import threading

from django.db import connections
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from integrations.shopify.client import is_configured
from integrations.shopify.webhooks import first_delivery, from_our_store, handle, signature_ok

logger = logging.getLogger(__name__)


def _handle_in_background(topic, payload):
    def work():
        try:
            handle(topic, payload)
        except Exception:
            logger.exception('Shopify webhook %s could not be handled', topic)  # the scheduled stock check catches up
        finally:
            connections.close_all()

    threading.Thread(target=work, daemon=True, name=f'shopify-webhook-{topic}').start()


@csrf_exempt  # Shopify signs the body instead; see signature_ok
@require_POST
def shopify_webhook(request):
    if not is_configured():
        return HttpResponse(status=404)
    if not signature_ok(request.body, request.headers.get('X-Shopify-Hmac-Sha256')) or not from_our_store(request.headers.get('X-Shopify-Shop-Domain')):
        return HttpResponse(status=401)
    if not first_delivery(request.headers.get('X-Shopify-Webhook-Id')):
        return HttpResponse(status=200)
    try:
        payload = json.loads(request.body)
    except ValueError:
        return HttpResponse(status=400)
    _handle_in_background(request.headers.get('X-Shopify-Topic', ''), payload)
    return HttpResponse(status=200)
