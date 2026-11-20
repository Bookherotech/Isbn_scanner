"""The store's genres (with their sub-categories) for the dropdowns, and a scanned book's genre.

The genres and sub-categories are the ones in inventory.constants.GENRE_TREE (Shopify cannot tell a main genre tag
from a sub or discount tag). Shopify gives the spelling: when the store already has a tag that matches a name
(ignoring case, "-" vs " ", a plural "s", "Age"/"Ages"; "Sci-Fi / Science Fiction" also matches "Sci-Fi" or
"Science Fiction"), the store's text is used, so what BookHero sends matches the collections. Every name is offered,
also one no product carries yet. Without Shopify (not configured, unreachable) the default spelling is used.

A scanned book that is already a product in the store takes its genre from that product's tags; any other book gets
a guess from the provider data (integrations.metadata.genre). Staff confirm either.
"""

import logging

from django.core.cache import cache

from integrations.metadata.genre import add_guesses
from integrations.shopify.client import graphql, is_configured
from integrations.shopify.exceptions import ShopifyError
from inventory.constants import GENRE_TREE, LANGUAGES

logger = logging.getLogger(__name__)

TAGS_CACHE_KEY = 'shopify:genre-tree'
TAGS_CACHE_SECONDS = 60 * 60  # a spelling changed in Shopify shows up within the hour
FAILED_CACHE_SECONDS = 5 * 60  # Shopify down: use the default spelling for a while instead of asking on every screen
MAX_TAG_PAGES = 20  # 250 tags per page
SCAN_TIMEOUT_SECONDS = 4  # staff are waiting on the scan: never hold it up long for the Shopify check

TAGS_QUERY = """
query StoreTags($after: String) {
  productTags(first: 250, after: $after) { nodes pageInfo { hasNextPage endCursor } }
}
"""

PRODUCT_TAGS_QUERY = """
query ProductTagsBySku($query: String!) {
  productVariants(first: 1, query: $query) { nodes { product { tags } } }
}
"""


def _store_tags():
    tags, after = [], None
    for _ in range(MAX_TAG_PAGES):
        page = graphql(TAGS_QUERY, {'after': after})['productTags']
        tags += page['nodes']
        if not page['pageInfo']['hasNextPage']:
            break
        after = page['pageInfo']['endCursor']
    return tags


def _variants(name):
    """Lower-case spellings that count as the same tag."""
    out = set()
    for part in {name, *[p for p in name.split(' / ') if p]}:
        base = part.strip().lower()
        for form in {base, base.replace('-', ' '), base.replace(' ', '-')}:
            out |= {form, form + 's', form[:-1] if form.endswith('s') else form}
            if form.startswith('age '):
                out.add('ages ' + form[4:])
            if form.startswith('ages '):
                out.add('age ' + form[5:])
    return out


def _spelling(name, store):
    """The store's tag for `name` (store = {lower tag: tag}), else `name` itself. The exact name wins over a variant."""
    if name.lower() in store:
        return store[name.lower()]
    return next((store[v] for v in sorted(_variants(name)) if v in store), name)


def store_genres():
    """{'genres': [{'name', 'subs': [...]}], 'languages': [...], 'source': 'shopify' | 'default'} (cached).

    Same order as GENRE_TREE / LANGUAGES, so position i is always the i-th default name.
    """
    cached = cache.get(TAGS_CACHE_KEY)
    if cached:
        return cached
    store, source, timeout = {}, 'default', TAGS_CACHE_SECONDS
    if is_configured():
        try:
            store = {t.strip().lower(): t.strip() for t in _store_tags() if t and t.strip()}
            source = 'shopify'
        except ShopifyError as error:
            logger.warning('Could not read the store tags for genres: %s', error)
            timeout = FAILED_CACHE_SECONDS
    result = {
        'genres': [{'name': _spelling(g, store), 'subs': [_spelling(s, store) for s in subs]} for g, subs in GENRE_TREE.items()],
        'languages': [_spelling(lang, store) for lang in LANGUAGES],
        'source': source,
    }
    cache.set(TAGS_CACHE_KEY, result, timeout)
    return result


def _find(value, names, defaults):
    """`value` as one of `names` (the store spelling); it may be written as the store name, the default name or a variant."""
    text = str(value or '').strip().lower()
    if not text:
        return ''
    for name, default in zip(names, defaults):
        if text == name.lower() or text == default.lower() or text in _variants(default):
            return name
    return ''


def _tree():
    lists = store_genres()
    return lists['genres'], lists['languages']


def canonical_genre(value):
    """A main genre in the store's spelling; '' when it is not one."""
    genres, _ = _tree()
    return _find(value, [g['name'] for g in genres], list(GENRE_TREE))


def canonical_subgenres(genre, values):
    """(the sub-categories of `genre` in the store's spelling, the values that are not sub-categories of it)."""
    genres, _ = _tree()
    for g, default in zip(genres, GENRE_TREE):
        if g['name'] == genre:
            subs, defaults = g['subs'], GENRE_TREE[default]
            break
    else:
        return [], list(values or [])
    found, unknown = [], []
    for value in values or []:
        sub = _find(value, subs, defaults)
        if sub and sub not in found:
            found.append(sub)
        elif not sub:
            unknown.append(value)
    return found, unknown


def canonical_language(value):
    _, languages = _tree()
    return _find(value, languages, list(LANGUAGES))


def shopify_genre_of(isbn13):
    """{'genre', 'subgenres', 'language'} from the tags of the store's product with this ISBN as SKU, or None when
    there is no such product (or Shopify cannot be asked right now)."""
    if not is_configured():
        return None
    try:
        nodes = graphql(PRODUCT_TAGS_QUERY, {'query': f'sku:{isbn13}'}, timeout=SCAN_TIMEOUT_SECONDS)['productVariants']['nodes']
    except ShopifyError as error:
        logger.warning('Could not read the Shopify tags for %s: %s', isbn13, error)
        return None
    if not nodes:
        return None
    tags = nodes[0]['product']['tags']
    genre = next((g for g in (canonical_genre(t) for t in tags) if g), '')
    subgenres = canonical_subgenres(genre, tags)[0] if genre else []
    language = next((lang for lang in (canonical_language(t) for t in tags) if lang), '')
    return {'genre': genre, 'subgenres': subgenres, 'language': language}


def store_guess(record, isbn=None):
    """A copy of a lookup / search result with genre, subgenres, language and genre_source:
    'shopify' = from the store's own product with this ISBN, 'guess' = from the book data, '' = nothing found.
    Guessed on every call (not cached with the record), always in the store's spelling."""
    record = dict(record)
    found = shopify_genre_of(isbn) if isbn else None
    if found and (found['genre'] or found['language']):
        record.update(found, genre_source='shopify')
        return record
    add_guesses(record)
    record['genre'] = canonical_genre(record['genre'])
    record['subgenres'] = canonical_subgenres(record['genre'], record['subgenres'])[0] if record['genre'] else []
    record['language'] = canonical_language(record['language'])
    record['genre_source'] = 'guess' if record['genre'] or record['language'] else ''
    return record
