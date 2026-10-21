from django.test import SimpleTestCase

from inventory.services import clean_isbn, duplicate_key, is_valid_isbn10, is_valid_isbn13, isbn10_to_13, normalize_author, normalize_title, to_isbn13


class IsbnTests(SimpleTestCase):
    def test_clean_keeps_digits_and_x(self):
        self.assertEqual(clean_isbn(' 978-0-14-118263-6 '), '9780141182636')
        self.assertEqual(clean_isbn('0-8044-2957-x'), '080442957X')
        self.assertEqual(clean_isbn(None), '')

    def test_isbn13_check_digit(self):
        self.assertTrue(is_valid_isbn13('9780141182636'))
        self.assertTrue(is_valid_isbn13('9798888123454'))  # 979 prefix
        self.assertFalse(is_valid_isbn13('9780141182637'))  # wrong check digit
        self.assertFalse(is_valid_isbn13('1234567890128'))  # must start with 978 / 979

    def test_isbn10_check_digit_and_conversion(self):
        self.assertTrue(is_valid_isbn10('0141182636'))
        self.assertTrue(is_valid_isbn10('080442957X'))
        self.assertFalse(is_valid_isbn10('0141182637'))
        self.assertEqual(isbn10_to_13('0141182636'), '9780141182636')

    def test_to_isbn13(self):
        self.assertEqual(to_isbn13('978-0-14-118263-6'), '9780141182636')
        self.assertEqual(to_isbn13('0141182636'), '9780141182636')
        for bad in ('', '12345', '9780141182637', '97801411826361', 'abc'):
            self.assertIsNone(to_isbn13(bad), bad)


class NormalizeTests(SimpleTestCase):
    """Same results as Frontend/src/services/normalize.js."""

    def test_title_drops_subtitle_article_and_punctuation(self):
        self.assertEqual(normalize_title('The Great Gatsby'), 'great gatsby')
        self.assertEqual(normalize_title('The Alchemist: A Fable About Following Your Dream'), 'alchemist')
        self.assertEqual(normalize_title('Thinking, Fast and Slow'), 'thinking fast and slow')
        self.assertEqual(normalize_title('Red, White & Royal Blue'), 'red white and royal blue')
        self.assertEqual(normalize_title('Les Misérables'), 'les miserables')

    def test_author_ignores_order_initials_and_accents(self):
        self.assertEqual(normalize_author('F. Scott Fitzgerald'), normalize_author('Fitzgerald, F. Scott'))
        self.assertEqual(normalize_author('Héctor García, Francesc Miralles'), 'francesc garcia hector miralles')
        self.assertEqual(normalize_author('David Thomas and Andrew Hunt'), normalize_author('Andrew Hunt, David Thomas'))

    def test_duplicate_key(self):
        self.assertEqual(duplicate_key('The Great Gatsby', 'F. Scott Fitzgerald'), 'great gatsby|fitzgerald scott')
        self.assertEqual(duplicate_key('Great Gatsby: A Novel', 'Fitzgerald, F. Scott'), duplicate_key('The Great Gatsby', 'F. Scott Fitzgerald'))
