"""A book's Shopify product category ("Print Books") and its category metafields: Genre, Book cover type,
Language version and Target audience, the fields the store fills on its own products to sort them by genre.

Category metafields (shopify.genre, ...) hold lists of metaobject entries (type "shopify--genre", ...); each entry
points to a value of Shopify's standard product taxonomy. The values are read from the taxonomy at run time and
matched to BookHero's genre / sub-categories / format / language / Kids ages by name. An entry the store does not
have yet is created. Nothing the store already set is overwritten: a product with another category, or a field
that already has a value, is left as it is.

Needs the app scopes read_metaobjects and write_metaobjects (besides the product scopes). Every failure is logged,
never raised: stock matters more than these fields.
"""

import json
import logging
import re

from django.core.cache import cache

from integrations.shopify.client import graphql, raise_user_errors
from integrations.shopify.exceptions import ShopifyError

logger = logging.getLogger(__name__)

CATEGORY_NAME = 'Print Books'
CATEGORY_PARENT = 'Books'
CATEGORY_CACHE_KEY = 'shopify:print-books-category'
ENTRIES_CACHE_KEY = 'shopify:category-entries:{type}'
CACHE_SECONDS = 24 * 60 * 60

CATEGORY_QUERY = """
query PrintBooks($search: String!) {
  taxonomy {
    categories(first: 20, search: $search) {
      nodes {
        id name fullName
        attributes(first: 50) {
          nodes { ... on TaxonomyChoiceListAttribute { name values(first: 250) { nodes { id name } } } }
        }
      }
    }
  }
}
"""

PRODUCT_QUERY = """
query ProductCategory($id: ID!) {
  product(id: $id) { category { id } metafields(first: 50, namespace: "shopify") { nodes { key value } } }
}
"""

SET_CATEGORY_MUTATION = """
mutation SetCategory($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}
"""

ENTRIES_QUERY = """
query Entries($type: String!, $after: String) {
  metaobjects(type: $type, first: 250, after: $after) {
    nodes { id displayName field(key: "taxonomy_reference") { value } }
    pageInfo { hasNextPage endCursor }
  }
}
"""

CREATE_ENTRY_MUTATION = """
mutation CreateEntry($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { field message } }
}
"""

SET_FIELDS_MUTATION = """
mutation SetFields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message } }
}
"""

# BookHero name -> other names the taxonomy may use for it (matched like the names themselves, see _words)
_ALIASES = {
    'kids': ("children's", 'children', 'kids'),
    'nonfiction': ('non-fiction', 'nonfiction'),
    'graphic novel': ('graphic novels', 'comics'),
    'sci-fi / science fiction': ('science fiction', 'sci-fi'),
    'self help': ('self-help',),
    'coffee table books': ('coffee table',),
    'autobiography': ('memoir', 'autobiography'),
    'information technology': ('computers', 'technology'),
    'board book': ('board book',),
}
_TEENS = {'age 13-15', 'age 16-18', 'ages 13-15', 'ages 16-18'}


def _norm(text):
    """Lower case, '-' as space, only letters / digits / apostrophes, a plural 's' dropped: 'Graphic Novels' -> 'graphic novel'."""
    text = re.sub(r"[^a-z0-9' ]+", ' ', str(text or '').lower().replace('-', ' '))
    return ' '.join(w[:-1] if len(w) > 3 and w.endswith('s') and not w.endswith("'s") else w for w in text.split())


def _words(text):
    """'Mystery & Thriller' -> {'mystery thriller', 'mystery', 'thriller'}."""
    parts = [text, *re.split(r'\s*(?:&|,|/|\band\b)\s*', str(text or '').lower())]
    return {n for n in map(_norm, parts) if n}


def _match(name, values):
    """The taxonomy values [(id, name)] that `name` (or one of its aliases) names: exact names first, else names that
    contain it as a part ('Mystery' -> 'Mystery & thriller')."""
    wanted = set().union(*(_words(n) for n in (name, *_ALIASES.get(str(name).lower(), ()))))
    exact = [v for v in values if _norm(v[1]) in wanted]
    return exact or [v for v in values if _words(v[1]) & wanted]


def _attribute_key(name):
    """'Book cover type' -> 'book-cover-type' (the metafield key, and the entry type after 'shopify--')."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def print_books():
    """{'id': category GID, 'attributes': {key: [(value GID, name)]}} of Media > Books > Print Books (cached), or None."""
    cached = cache.get(CATEGORY_CACHE_KEY)
    if cached:
        return cached
    nodes = graphql(CATEGORY_QUERY, {'search': CATEGORY_NAME})['taxonomy']['categories']['nodes']
    node = next((n for n in nodes if n['name'] == CATEGORY_NAME and f'{CATEGORY_PARENT} > {CATEGORY_NAME}' in n['fullName']), None)
    if node is None:
        logger.warning('Shopify has no "%s" product category.', CATEGORY_NAME)
        return None
    attributes = {
        _attribute_key(a['name']): [(v['id'], v['name']) for v in a['values']['nodes']]
        for a in node['attributes']['nodes'] if a.get('name') and a.get('values')
    }
    found = {'id': node['id'], 'attributes': attributes}
    cache.set(CATEGORY_CACHE_KEY, found, CACHE_SECONDS)
    return found


def wanted_values(book, attributes):
    """{metafield key: [(value GID, name)]} for the book: genre + sub-categories, format, language, audience."""
    names = {
        'genre': [book.genre, *(book.subgenres or [])] if book.genre else [],
        'book-cover-type': [book.format] if book.format else [],
        'language-version': [book.language or 'English'],  # BookHero tags only non-English books with a language
        'target-audience': [],
    }
    if book.genre:
        if book.genre.lower() == 'kids':
            teens = {s.lower() for s in book.subgenres or []} & _TEENS
            names['target-audience'] = ['Teens', 'Young adults'] if teens else ['Children', 'Kids']
        else:
            names['target-audience'] = ['Adults']
    found = {}
    for key, wanted in names.items():
        values = attributes.get(key) or []
        picked = []
        for name in wanted:
            for value in _match(name, values):
                if value not in picked:
                    picked.append(value)
            if key == 'target-audience' and picked:
                break  # one audience is enough
        if picked:
            found[key] = picked
    return found


def _entries(entry_type):
    """{taxonomy value GID or lower-case label: entry GID} of the store's entries of this type (cached)."""
    key = ENTRIES_CACHE_KEY.format(type=entry_type)
    cached = cache.get(key)
    if cached is not None:
        return cached
    entries, after = {}, None
    for _ in range(10):
        page = graphql(ENTRIES_QUERY, {'type': entry_type, 'after': after})['metaobjects']
        for node in page['nodes']:
            entries[node['displayName'].strip().lower()] = node['id']
            if (node.get('field') or {}).get('value'):
                entries[node['field']['value']] = node['id']
        if not page['pageInfo']['hasNextPage']:
            break
        after = page['pageInfo']['endCursor']
    cache.set(key, entries, CACHE_SECONDS)
    return entries


def _entry_id(attribute_key, value_id, name):
    """The store's entry for a taxonomy value, created when the store has none yet."""
    entry_type = f'shopify--{attribute_key}'
    entries = _entries(entry_type)
    found = entries.get(value_id) or entries.get(name.lower())
    if found:
        return found
    result = graphql(CREATE_ENTRY_MUTATION, {'metaobject': {
        'type': entry_type, 'fields': [{'key': 'label', 'value': name}, {'key': 'taxonomy_reference', 'value': value_id}],
    }})['metaobjectCreate']
    raise_user_errors(result)
    entries[value_id] = entries[name.lower()] = result['metaobject']['id']
    cache.set(ENTRIES_CACHE_KEY.format(type=entry_type), entries, CACHE_SECONDS)
    return entries[value_id]


def set_book_category(gid, book):
    """Give the product the Print Books category (when it has none) and fill its empty category fields from the book."""
    try:
        category = print_books()
        if category is None:
            return
        product = graphql(PRODUCT_QUERY, {'id': gid})['product']
        if product is None:
            return
        current = (product.get('category') or {}).get('id')
        if current and current != category['id']:
            return  # the store chose another category: its fields are different, leave it
        if not current:
            raise_user_errors(graphql(SET_CATEGORY_MUTATION, {'product': {'id': gid, 'category': category['id']}})['productUpdate'])
        filled = {m['key'] for m in product['metafields']['nodes'] if m.get('value') not in (None, '', '[]')}
        metafields = []
        for key, values in wanted_values(book, category['attributes']).items():
            if key in filled:
                continue
            ids = []
            for value_id, name in values:
                try:
                    ids.append(_entry_id(key, value_id, name))
                except ShopifyError as error:
                    logger.warning('Could not add the %s "%s" in Shopify: %s', key, name, error)
            if ids:
                metafields.append({'ownerId': gid, 'namespace': 'shopify', 'key': key, 'type': 'list.metaobject_reference', 'value': json.dumps(ids)})
        if metafields:
            raise_user_errors(graphql(SET_FIELDS_MUTATION, {'metafields': metafields})['metafieldsSet'])
    except ShopifyError as error:
        logger.warning('Could not set the category of %s: %s', gid, error)
