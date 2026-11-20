"""The store's genres: each main genre with the sub-categories under it, and the languages. Every value is sent to
Shopify as a product tag; the collections pick books up by these tags. The text here is the default spelling: when
the store already has the tag, the store's own spelling is used (see integrations.shopify.genres).

Mirror of Frontend/src/services/genres.js.
"""

GENRE_TREE = {
    'Kids': ('Age 0-3', 'Age 4-8', 'Age 9-12', 'Age 13-15', 'Age 16-18'),
    'Fiction': (
        'Action', 'Adventure', 'Classics', 'Comedy', 'Crime', 'Drama', 'General Fiction', 'Historical', 'Horror', 'Mystery',
        'Romance', 'Sci-Fi / Science Fiction', 'Thriller',
    ),
    'Nonfiction': (
        'Architecture', 'Art', 'Autobiography', 'Biography', 'Business', 'Cooking', 'Encyclopedia', 'Finance', 'Gardening',
        'Health', 'History', 'Information Technology', 'Journalism', 'Marketing', 'Music', 'Nutrition', 'Philosophy',
        'Politics', 'Science', 'Self Help', 'Sports', 'Travel',
    ),
    'Education': (),
    'Coffee Table Books': (),
    'Manga': (),
    'Graphic Novel': (),
}
GENRES = tuple(GENRE_TREE)
LANGUAGES = ('Arabic', 'French', 'Spanish')
