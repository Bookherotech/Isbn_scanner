"""The Shopify calls BookHero needs: find / create a book's product, set its stock, read stock back.

A book is a single-variant product whose SKU is the ISBN-13, stocked at SHOPIFY_LOCATION_ID.
IDs are kept as plain numbers in the database (Book.product_id) and turned into GIDs here.
"""

import html
import uuid

from django.conf import settings

from integrations.shopify.client import graphql, location_gid, put_file, raise_user_errors
from integrations.shopify.exceptions import ProductGone, ShopifyError

STOCK_BATCH = 50  # products per stock query (keeps the query cost well under Shopify's limit)
BOOKHERO_TAG = 'BookHero'  # marks products we created: images are only ever added to these, never to the store's own products
DEFAULT_OPTION = {'name': 'Title', 'values': [{'name': 'Default Title'}]}  # how Shopify names a product with no options
DEFAULT_VALUE = [{'optionName': 'Title', 'name': 'Default Title'}]


def _description_html(book):
    """'By <author>', then the description, as safe HTML: the text comes from outside sources and from staff."""
    lines = [f'By {book.author}'] if book.author else []
    lines += [line.strip() for line in book.description.splitlines() if line.strip()]
    return ''.join(f'<p>{html.escape(line)}</p>' for line in lines)


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


FIND_QUERY = """
query FindBySku($query: String!) {
  productVariants(first: 1, query: $query) {
    nodes { product { id } inventoryItem { id } }
  }
}
"""


def find_by_isbn(isbn):
    """(product GID, inventory item GID) of the product whose SKU is this ISBN, or None."""
    nodes = graphql(FIND_QUERY, {'query': f'sku:{isbn}'})['productVariants']['nodes']
    if not nodes:
        return None
    return nodes[0]['product']['id'], nodes[0]['inventoryItem']['id']


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
    userErrors { field message }
  }
}
"""


def create_product(book, quantity):
    """A new product for the book, with `quantity` available at our location -> (product GID, inventory item GID).

    It is created with SHOPIFY_PRODUCT_STATUS (DRAFT by default): BookHero has no prices, so an admin sets the
    price in Shopify and publishes it there.
    """
    product = {
        'title': book.title,
        'vendor': book.publisher or book.author,
        'productType': 'Book',
        'status': settings.SHOPIFY_PRODUCT_STATUS,
        'tags': [BOOKHERO_TAG],
        'descriptionHtml': _description_html(book),
        'productOptions': [DEFAULT_OPTION],
        'variants': [{
            'optionValues': DEFAULT_VALUE,
            'inventoryItem': {'sku': book.isbn, 'tracked': True},
            'inventoryQuantities': [{'locationId': location_gid(), 'name': 'available', 'quantity': quantity}],
        }],
    }
    if book.cover_url.startswith('https://') and not (book.cover_photo or book.cached_cover):  # a file of ours is uploaded after this, see attach_image
        product['files'] = [{'originalSource': book.cover_url, 'alt': book.title[:255], 'contentType': 'IMAGE'}]
    result = graphql(CREATE_MUTATION, {'input': product})['productSet']
    raise_user_errors(result)
    created = result['product']
    return created['id'], created['variants']['nodes'][0]['inventoryItem']['id']


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

    Products that are gone from Shopify, or not stocked at our location, are left out.
    """
    found = {}
    ids = list(dict.fromkeys(str(p) for p in product_ids))
    for start in range(0, len(ids), STOCK_BATCH):
        batch = ids[start:start + STOCK_BATCH]
        nodes = graphql(STOCK_QUERY, {'ids': [product_gid(p) for p in batch], 'location': location_gid()})['nodes']
        for node in nodes:
            variants = (node or {}).get('variants', {}).get('nodes') or []
            level = variants[0]['inventoryItem']['inventoryLevel'] if variants else None
            if level and level['quantities']:
                found[numeric_id(node['id'])] = max(int(level['quantities'][0]['quantity']), 0)
    return found
