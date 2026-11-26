"""MySQL full-text search over the books' title and author.

The FULLTEXT index is not something Django's model Meta can declare, and migrations are made on the server, so it is
created after every `migrate` (post_migrate, see inventory.apps) when it is missing. Other databases have no index and
search falls back to "contains" (see book_admin.services.book_queries.search_filter).
"""

import logging
import re

from django.db import connection

logger = logging.getLogger(__name__)

TABLE = 'inventory_books'
INDEX = 'book_title_author_ft'
COLUMNS = ('title', 'author')

MIN_WORD = 3  # InnoDB's innodb_ft_min_token_size: shorter words are not in the index
# InnoDB's default stopword list: these are not in the index either, so a "+the*" term would find nothing.
STOPWORDS = frozenset(
    'a about an are as at be by com de en for from how i in is it la of on or that the this to was what when where who will with und www'.split()
)


def ensure_fulltext_index(**kwargs):
    """Add the FULLTEXT index on inventory_books (title, author) when it is missing. MySQL only; safe to run again."""
    if connection.vendor != 'mysql':
        return
    with connection.cursor() as cursor:
        tables = connection.introspection.table_names(cursor)
        if TABLE not in tables:
            return
        cursor.execute(
            'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = %s AND index_name = %s LIMIT 1',
            [TABLE, INDEX],
        )
        if cursor.fetchone():
            return
        logger.info('Adding the full-text index %s on %s', INDEX, TABLE)
        cursor.execute(f'ALTER TABLE {TABLE} ADD FULLTEXT INDEX {INDEX} ({", ".join(COLUMNS)})')


def boolean_query(text):
    """The MySQL boolean-mode query for what an admin typed: every word of 3+ letters must start a word of the title or
    author ("atomic hab" -> "+atomic* +hab*"). '' when no word can use the index (too short / stopwords only)."""
    words = [w for w in re.findall(r'\w+', text.lower()) if len(w) >= MIN_WORD and w not in STOPWORDS]
    return ' '.join(f'+{w}*' for w in words)


def fulltext_ids_sql():
    """SQL (one %s: the boolean query) for the ids of the books whose title / author match."""
    return f'SELECT id FROM {TABLE} WHERE MATCH({", ".join(COLUMNS)}) AGAINST (%s IN BOOLEAN MODE)'
