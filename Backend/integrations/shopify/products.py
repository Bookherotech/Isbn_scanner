"""The Shopify calls BookHero needs: find / create a book's product, set its stock, read stock back.

A book is a single-variant product whose barcode is the ISBN-13 and whose SKU is "<shelf>-<ISBN-13>" (e.g.
A-01-9780141339207), stocked at SHOPIFY_LOCATION_ID. Older products (and the store's own) may have the bare ISBN as SKU,
so a book's product is found by barcode or SKU.
Its shelf is kept in the product's "Shelf location" field (metafield custom.shelf_location).
IDs are kept as plain numbers in the database (Book.product_id) and turned into GIDs here.
"""

import html
import logging
import uuid

from django.conf import settings
from django.core.cache import cache
from django.utils.text import slugify

from integrations.shopify.client import graphql, is_configured, location_gid, put_file, raise_user_errors
from integrations.shopify.exceptions import ProductGone, ShopifyError

STOCK_BATCH = 50  # products per stock query (keeps the query cost well under Shopify's limit)
logger = logging.getLogger(__name__)

BOOKHERO_TAG = 'BookHero'  # marks products we created: images are only ever added to these, never to the store's own products
DEFAULT_OPTION = {'name': 'Title', 'values': [{'name': 'Default Title'}]}  # how Shopify names a product with no options
DEFAULT_VALUE = [{'optionName': 'Title', 'name': 'Default Title'}]


def _description_html(book):
    """The description, then the details the store lists under it (Dimensions, Author, ISBN, Format, Pages; empty ones
    left out), as safe HTML: the text comes from outside sources and from staff."""
    lines = [line.strip() for line in book.description.splitlines() if line.strip()]
    details = [('Dimensions', book.dimensions), ('Author', book.author), ('ISBN', book.isbn), ('Format', book.format), ('Pages', book.pages)]
    lines += [f'{label}: {value}' for label, value in details if value]
    return ''.join(f'<p>{html.escape(line)}</p>' for line in lines)


SEO_SUFFIX = 'BookHero Dubai'
_SMALL_WORDS = {'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'with'}


def _title_case(text):
    """'the return of the king' -> 'The Return of the King'. A word that already has a capital ('iPhone', 'McCarthy')
    is kept as written; small words stay lower case except first."""
    words = str(text or '').split()
    return ' '.join(
        w if any(c.isupper() for c in w) or (i and w in _SMALL_WORDS) else w[:1].upper() + w[1:]
        for i, w in enumerate(words)
    )


def seo_title(book):
    """The search engine page title: 'The Return by Victoria Hislop | BookHero Dubai'."""
    name = _title_case(book.title)
    if book.author:
        name = f'{name} by {_title_case(book.author)}'
    return f'{name} | {SEO_SUFFIX}'[:255]


def book_handle(book):
    """The product URL handle: 'the-return-victoria-hislop' (title, then author). '' when neither has latin letters
    or digits (e.g. an Arabic title): Shopify then makes one from the product title."""
    return slugify(f'{book.title} {book.author}')[:200].strip('-')


def book_tags(book):
    """The genre, sub-category and language tags of a book (the store's collections pick products up by these)."""
    return [tag for tag in (book.genre, *(book.subgenres or []), book.language) if tag]


def product_gid(product_id):
    return f'gid://shopify/Product/{product_id}'


def numeric_id(gid):
    """'gid://shopify/Product/123' -> '123'."""
    return str(gid).rsplit('/', 1)[-1]


SHOP_QUERY = """
query Shop($location: ID!) {
  shop { name myshopifyDomain }
  location(id: $location) { name isActive }
}
"""


def shop_info():
    """{'shop': name, 'domain': ..., 'location': name}. Proves the credentials, scopes and location ID all work."""
    data = graphql(SHOP_QUERY, {'location': location_gid()})
    location = data.get('location')
    if not location:
        raise ShopifyError('SHOPIFY_LOCATION_ID does not match a location in this store.')
    return {'shop': data['shop']['name'], 'domain': data['shop']['myshopifyDomain'], 'location': location['name']}


def book_sku(shelf_code, isbn):
    """The SKU BookHero gives a book's product: its shelf, then its ISBN."""
    return f'{shelf_code}-{isbn}'


def isbn_query(isbn):
    """Product variant search for a book: the barcode is the ISBN; the SKU is the bare ISBN on older / the store's own products."""
    return f'barcode:{isbn} OR sku:{isbn}'


COPIES_QUERY = """
query IsbnCopies($query: String!, $location: ID!) {
  productVariants(first: 20, query: $query) {
    nodes {
      sku
      product { id title status }
      inventoryItem { id inventoryLevel(locationId: $location) { quantities(names: ["available"]) { quantity } } }
    }
  }
}
"""


def isbn_copies(isbn, timeout=None):
    """Every product in the store whose barcode (or SKU) is this ISBN, oldest first: [{'gid', 'id', 'item', 'title',
    'status' ('ACTIVE' | 'DRAFT' | 'ARCHIVED'), 'available' (units at our location; 0 when not stocked there),
    'shelf' (from a '<shelf>-<ISBN>' SKU, else '')}]."""
    nodes = graphql(COPIES_QUERY, {'query': isbn_query(isbn), 'location': location_gid()}, timeout=timeout)['productVariants']['nodes']
    copies = {}
    for node in nodes:
        product = node.get('product') or {}
        if not product.get('id') or product['id'] in copies:
            continue
        level = (node.get('inventoryItem') or {}).get('inventoryLevel')
        quantities = (level or {}).get('quantities') or []
        sku = str(node.get('sku') or '')
        copies[product['id']] = {
            'gid': product['id'], 'id': numeric_id(product['id']), 'item': (node.get('inventoryItem') or {}).get('id'),
            'title': product.get('title') or '', 'status': str(product.get('status') or '').upper(),
            'available': max(int(quantities[0]['quantity']), 0) if quantities else 0,
            'shelf': sku[:-len(isbn) - 1] if sku.endswith(f'-{isbn}') else '',
        }
    return sorted(copies.values(), key=lambda c: int(c['id']) if c['id'].isdigit() else 0)


def product_for_book(isbn):
    """(product GID, inventory item GID) of the store's product a newly approved book should go on, or None (create one).

    Only a product with the status new products get (SHOPIFY_PRODUCT_STATUS) is used: with DRAFT, an existing draft is
    updated and an ACTIVE product is never touched (a new draft is made instead); with ACTIVE, the active product.
    Several such copies: the oldest.
    """
    wanted = str(settings.SHOPIFY_PRODUCT_STATUS).upper()
    same = next((c for c in isbn_copies(isbn) if c['status'] == wanted and c['item']), None)
    return (same['gid'], same['item']) if same else None


SCAN_TIMEOUT_SECONDS = 5  # staff are waiting on the submit


def shopify_wait(isbn):
    """The match a new scan waits behind when the store already has units of this ISBN on Shopify, or None (no copy
    with units, Shopify not set up or not reachable: the scan goes to Pending as before). Stored on the entry as its
    `match`; 'shopify': True marks it (see integrations.shopify.sync.release_shopify_waits)."""
    if not is_configured():
        return None
    try:
        copies = isbn_copies(isbn, timeout=SCAN_TIMEOUT_SECONDS)
    except ShopifyError as error:
        logger.warning('Could not check the Shopify stock of %s: %s', isbn, error)
        return None
    stocked = [c for c in copies if c['available'] > 0]
    if not stocked:
        return None
    first = stocked[0]
    return {
        'item_id': None, 'title': first['title'], 'author': '', 'isbn': isbn, 'shelf_id': first['shelf'] or 'Shopify',
        'quantity': sum(c['available'] for c in stocked), 'status': 'live', 'sync_status': 'synced',
        'shopify': True, 'product_id': first['id'], 'copies': len(copies),
    }


ITEM_QUERY = """
query InventoryItem($id: ID!) {
  product(id: $id) { variants(first: 1) { nodes { inventoryItem { id } } } }
}
"""


def inventory_item_of(product_id):
    """The inventory item GID of a product's (only) variant."""
    product = graphql(ITEM_QUERY, {'id': product_gid(product_id)})['product']
    nodes = (product or {}).get('variants', {}).get('nodes') or []
    if not nodes:
        raise ProductGone('The Shopify product for this book no longer exists.')
    return nodes[0]['inventoryItem']['id']


CREATE_MUTATION = """
mutation CreateBook($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id variants(first: 1) { nodes { inventoryItem { id } } } }
    userErrors { field message code }
  }
}
"""


def create_product(book, quantity):
    """A new product for the book, with `quantity` available at our location -> (product GID, inventory item GID).

    It is created with SHOPIFY_PRODUCT_STATUS (DRAFT by default): BookHero has no prices, so an admin sets the
    price in Shopify and publishes it there. Its page title is seo_title and its URL handle book_handle; when another
    product already has that handle, the ISBN is added to it ('the-return-victoria-hislop-9781...'), and when that
    is taken too, Shopify picks one.
    """
    product = {
        'title': book.title,
        'seo': {'title': seo_title(book)},
        'vendor': book.publisher or book.author,
        'productType': 'Book',
        'status': settings.SHOPIFY_PRODUCT_STATUS,
        'tags': [BOOKHERO_TAG, *book_tags(book)],
        'descriptionHtml': _description_html(book),
        'productOptions': [DEFAULT_OPTION],
        'variants': [{
            'optionValues': DEFAULT_VALUE,
            'barcode': book.isbn,
            'inventoryItem': {'sku': book_sku(book.shelf.code, book.isbn), 'tracked': True},
            'inventoryQuantities': [{'locationId': location_gid(), 'name': 'available', 'quantity': quantity}],
        }],
        'metafields': [{**SHELF_FIELD, 'value': book.shelf.code}],
    }
    if book.cover_url.startswith('https://') and not (book.cover_photo or book.cached_cover):  # a file of ours is uploaded after this, see attach_image
        product['files'] = [{'originalSource': book.cover_url, 'alt': book.title[:255], 'contentType': 'IMAGE'}]
    handle = book_handle(book)
    for candidate in ([handle, f'{handle}-{book.isbn}', None] if handle else [None]):
        if candidate:
            product['handle'] = candidate
        else:
            product.pop('handle', None)
        result = graphql(CREATE_MUTATION, {'input': product})['productSet']
        taken = any(e.get('code') == 'HANDLE_NOT_UNIQUE' for e in result.get('userErrors') or [])
        if not (taken and candidate):
            break
    raise_user_errors(result)
    created = result['product']
    return created['id'], created['variants']['nodes'][0]['inventoryItem']['id']


SHELF_FIELD = {'namespace': 'custom', 'key': 'shelf_location', 'type': 'single_line_text_field'}
SHELF_DEFINITION_CACHE_KEY = 'shopify:shelf-definition'

SHELF_DEFINITION_MUTATION = """
mutation ShelfDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message code } }
}
"""

SHELF_SET_MUTATION = """
mutation SetShelf($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message } }
}
"""


def ensure_shelf_definition():
    """Make the "Shelf location" field a named, pinned field on the product page (once; remembered for a day).
    Without it the value is still saved, just listed among the product's other metafields."""
    if cache.get(SHELF_DEFINITION_CACHE_KEY):
        return
    definition = {
        **{k: SHELF_FIELD[k] for k in ('namespace', 'key', 'type')}, 'name': 'Shelf location', 'ownerType': 'PRODUCT', 'pin': True,
        'description': 'The shelf the book is on in the store (set by BookHero).',
    }
    try:
        errors = graphql(SHELF_DEFINITION_MUTATION, {'definition': definition})['metafieldDefinitionCreate']['userErrors']
    except ShopifyError as error:
        logger.warning('Could not create the Shelf location field in Shopify: %s', error)
        return
    if errors and not all(e.get('code') == 'TAKEN' for e in errors):  # TAKEN = it exists already
        logger.warning('Could not create the Shelf location field in Shopify: %s', errors)
        return
    cache.set(SHELF_DEFINITION_CACHE_KEY, True, 24 * 60 * 60)


VARIANT_QUERY = """
query BookVariant($id: ID!) {
  product(id: $id) { variants(first: 1) { nodes { id } } }
}
"""

SKU_MUTATION = """
mutation SetSku($product: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $product, variants: $variants) { userErrors { field message } }
}
"""


def set_shelf_location(product_gid_or_id, shelf_code, isbn):
    """Write the book's current shelf on its product: the "Shelf location" field, and the SKU "<shelf>-<ISBN>" (with the
    ISBN as barcode). A failure is logged, never raised: stock matters more."""
    gid = product_gid_or_id if str(product_gid_or_id).startswith('gid://') else product_gid(product_gid_or_id)
    ensure_shelf_definition()
    try:
        result = graphql(SHELF_SET_MUTATION, {'metafields': [{**SHELF_FIELD, 'ownerId': gid, 'value': shelf_code}]})['metafieldsSet']
        raise_user_errors(result)
    except ShopifyError as error:
        logger.warning('Could not set the shelf location of %s: %s', gid, error)
    try:
        variants = ((graphql(VARIANT_QUERY, {'id': gid})['product'] or {}).get('variants') or {}).get('nodes') or []
        if variants:
            variant = {'id': variants[0]['id'], 'barcode': isbn, 'inventoryItem': {'sku': book_sku(shelf_code, isbn)}}
            raise_user_errors(graphql(SKU_MUTATION, {'product': gid, 'variants': [variant]})['productVariantsBulkUpdate'])
    except ShopifyError as error:
        logger.warning('Could not set the SKU of %s: %s', gid, error)


TAGS_MUTATION = """
mutation AddTags($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}
"""


def add_tags(product_gid_or_id, tags):
    """Add tags to a product; tags it already has, and its other tags, are left as they are."""
    if not tags:
        return
    gid = product_gid_or_id if str(product_gid_or_id).startswith('gid://') else product_gid(product_gid_or_id)
    result = graphql(TAGS_MUTATION, {'id': gid, 'tags': list(tags)})['tagsAdd']
    raise_user_errors(result)


MEDIA_QUERY = """
query ProductMedia($id: ID!) {
  product(id: $id) { tags media(first: 1) { nodes { id } } }
}
"""


def product_media(product_id):
    """{'ours': created by BookHero, 'has_media': has an image already}, or None when the product is gone."""
    product = graphql(MEDIA_QUERY, {'id': product_gid(product_id)})['product']
    if product is None:
        return None
    return {'ours': BOOKHERO_TAG in product['tags'], 'has_media': bool(product['media']['nodes'])}


STAGED_MUTATION = """
mutation StagedUpload($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}
"""

ATTACH_MUTATION = """
mutation AttachImage($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product { id }
    userErrors { field message }
  }
}
"""


def attach_image(product_id, raw, filename, alt=''):
    """Upload JPEG bytes straight to Shopify and add them to the product. Needs no public URL on our side.

    Shopify processes the image after this returns, so a bad image would show up in Shopify admin, not here.
    """
    staged = graphql(STAGED_MUTATION, {'input': [{'resource': 'PRODUCT_IMAGE', 'filename': filename, 'mimeType': 'image/jpeg', 'httpMethod': 'PUT'}]})['stagedUploadsCreate']
    raise_user_errors(staged)
    target = staged['stagedTargets'][0]
    put_file(target['url'], raw, {p['name']: p['value'] for p in target['parameters']})
    result = graphql(ATTACH_MUTATION, {
        'product': {'id': product_gid(product_id)},
        'media': [{'originalSource': target['resourceUrl'], 'alt': alt[:255], 'mediaContentType': 'IMAGE'}],
    })['productUpdate']
    raise_user_errors(result)


SET_STOCK_MUTATION = """
mutation SetStock($input: InventorySetQuantitiesInput!, $key: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $key) {
    userErrors { code field message }
  }
}
"""


def set_available(inventory_item_gid, quantity):
    """Set the 'available' count at our location (overwrites whatever Shopify had: our shelf count is the truth)."""
    result = graphql(SET_STOCK_MUTATION, {
        'key': str(uuid.uuid4()),
        'input': {
            'name': 'available',
            'reason': 'correction',
            'quantities': [{'inventoryItemId': inventory_item_gid, 'locationId': location_gid(), 'quantity': quantity, 'changeFromQuantity': None}],
        },
    })['inventorySetQuantities']
    raise_user_errors(result)


STOCK_QUERY = """
query Stock($ids: [ID!]!, $location: ID!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      variants(first: 1) { nodes { inventoryItem { inventoryLevel(locationId: $location) { quantities(names: ["available"]) { quantity } } } } }
    }
  }
}
"""


def available_stock(product_ids):
    """{product_id: available units at our location} for the given numeric IDs.

    A product that exists but is not stocked at our location maps to None. Products gone from Shopify are left out.
    """
    found = {}
    ids = list(dict.fromkeys(str(p) for p in product_ids))
    for start in range(0, len(ids), STOCK_BATCH):
        batch = ids[start:start + STOCK_BATCH]
        nodes = graphql(STOCK_QUERY, {'ids': [product_gid(p) for p in batch], 'location': location_gid()})['nodes']
        for node in nodes:
            if node is None:
                continue  # Shopify has no such product
            variants = node.get('variants', {}).get('nodes') or []
            level = variants[0]['inventoryItem']['inventoryLevel'] if variants else None
            found[numeric_id(node['id'])] = max(int(level['quantities'][0]['quantity']), 0) if level and level['quantities'] else None
    return found
