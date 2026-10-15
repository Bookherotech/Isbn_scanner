/**
 * Mock metadata catalogue — stands in for Google Books / Open Library.
 * Row format: [isbn13, title, author, publisher, year, pages, source]
 * source: 'google' | 'openlibrary' | 'manual'
 */
const ROWS = [
  ['9780735211292', 'Atomic Habits', 'James Clear', 'Avery', 2018, 320, 'google'],
  ['9780132350884', 'Clean Code', 'Robert C. Martin', 'Prentice Hall', 2008, 464, 'google'],
  ['9780135957059', 'The Pragmatic Programmer', 'David Thomas, Andrew Hunt', 'Addison-Wesley', 2019, 352, 'google'],
  ['9780062315007', 'The Alchemist', 'Paulo Coelho', 'HarperOne', 2014, 208, 'google'],
  ['9780062316097', 'Sapiens', 'Yuval Noah Harari', 'Harper', 2015, 464, 'google'],
  ['9781455586691', 'Deep Work', 'Cal Newport', 'Grand Central Publishing', 2016, 304, 'google'],
  ['9780857197689', 'The Psychology of Money', 'Morgan Housel', 'Harriman House', 2020, 256, 'google'],
  ['9780374533557', 'Thinking, Fast and Slow', 'Daniel Kahneman', 'Farrar, Straus and Giroux', 2013, 512, 'google'],
  ['9780143130727', 'Ikigai', 'Héctor García, Francesc Miralles', 'Penguin Books', 2017, 208, 'google'],
  ['9780451524935', '1984', 'George Orwell', 'Signet Classics', 1961, 328, 'openlibrary'],
  ['9780061120084', 'To Kill a Mockingbird', 'Harper Lee', 'Harper Perennial', 2006, 336, 'google'],
  ['9780141439518', 'Pride and Prejudice', 'Jane Austen', 'Penguin Classics', 2002, 480, 'openlibrary'],
  ['9780547928227', 'The Hobbit', 'J.R.R. Tolkien', 'Mariner Books', 2012, 300, 'google'],
  ['9780399590504', 'Educated', 'Tara Westover', 'Random House', 2018, 352, 'google'],
  ['9781524763138', 'Becoming', 'Michelle Obama', 'Crown', 2018, 448, 'google'],
  ['9780525559474', 'The Midnight Library', 'Matt Haig', 'Viking', 2020, 304, 'google'],
  ['9780735219090', 'Where the Crawdads Sing', 'Delia Owens', "G.P. Putnam's Sons", 2018, 384, 'google'],
  ['9780441172719', 'Dune', 'Frank Herbert', 'Ace', 1990, 535, 'openlibrary'],
  ['9780316769488', 'The Catcher in the Rye', 'J.D. Salinger', 'Little, Brown', 1991, 277, 'openlibrary'],
  ['9780060850524', 'Brave New World', 'Aldous Huxley', 'Harper Perennial', 2006, 288, 'google'],
  ['9781612680194', 'Rich Dad Poor Dad', 'Robert T. Kiyosaki', 'Plata Publishing', 2017, 336, 'google'],
  ['9780807014295', "Man's Search for Meaning", 'Viktor E. Frankl', 'Beacon Press', 2006, 184, 'openlibrary'],
  ['9781982137274', 'The 7 Habits of Highly Effective People', 'Stephen R. Covey', 'Simon & Schuster', 2020, 464, 'google'],
  ['9781591846444', 'Start with Why', 'Simon Sinek', 'Portfolio', 2011, 256, 'google'],
  ['9780804139298', 'Zero to One', 'Peter Thiel', 'Crown Business', 2014, 224, 'google'],
  ['9780307887894', 'The Lean Startup', 'Eric Ries', 'Crown Business', 2011, 336, 'google'],
  ['9781501135910', 'Shoe Dog', 'Phil Knight', 'Scribner', 2016, 400, 'google'],
  ['9780316017930', 'Outliers', 'Malcolm Gladwell', 'Little, Brown', 2008, 320, 'google'],
  ['9780307352156', 'Quiet', 'Susan Cain', 'Crown', 2012, 368, 'google'],
  ['9780812981605', 'The Power of Habit', 'Charles Duhigg', 'Random House', 2014, 416, 'google'],
  ['9781501111105', 'Grit', 'Angela Duckworth', 'Scribner', 2016, 352, 'google'],
  ['9781451648539', 'Steve Jobs', 'Walter Isaacson', 'Simon & Schuster', 2011, 656, 'google'],
  ['9781594631931', 'The Kite Runner', 'Khaled Hosseini', 'Riverhead Books', 2013, 400, 'google'],
  ['9781594483851', 'A Thousand Splendid Suns', 'Khaled Hosseini', 'Riverhead Books', 2008, 384, 'google'],
  ['9780375842207', 'The Book Thief', 'Markus Zusak', 'Knopf', 2007, 592, 'google'],
  ['9780156027328', 'Life of Pi', 'Yann Martel', 'Mariner Books', 2003, 326, 'openlibrary'],
  ['9780307387899', 'The Road', 'Cormac McCarthy', 'Vintage', 2007, 287, 'google'],
  ['9780375704024', 'Norwegian Wood', 'Haruki Murakami', 'Vintage', 2000, 296, 'openlibrary'],
  ['9781400079278', 'Kafka on the Shore', 'Haruki Murakami', 'Vintage', 2006, 480, 'openlibrary'],
  ['9780156012195', 'The Little Prince', 'Antoine de Saint-Exupéry', 'Harcourt', 2000, 96, 'openlibrary'],
  ['9780060883287', 'One Hundred Years of Solitude', 'Gabriel García Márquez', 'Harper Perennial', 2006, 417, 'google'],
  ['9780451526342', 'Animal Farm', 'George Orwell', 'Signet Classics', 2004, 140, 'openlibrary'],
  ['9780399501487', 'Lord of the Flies', 'William Golding', 'Perigee', 2003, 208, 'google'],
  ['9780140177398', 'Of Mice and Men', 'John Steinbeck', 'Penguin Books', 1993, 112, 'openlibrary'],
  ['9780486282114', 'Frankenstein', 'Mary Shelley', 'Dover Publications', 1994, 176, 'openlibrary'],
  ['9780141441146', 'Jane Eyre', 'Charlotte Brontë', 'Penguin Classics', 2006, 624, 'openlibrary'],
  ['9780141439556', 'Wuthering Heights', 'Emily Brontë', 'Penguin Classics', 2003, 416, 'openlibrary'],
  ['9780756404741', 'The Name of the Wind', 'Patrick Rothfuss', 'DAW Books', 2008, 662, 'google'],
  ['9780593135204', 'Project Hail Mary', 'Andy Weir', 'Ballantine Books', 2021, 496, 'google'],
  ['9780553418026', 'The Martian', 'Andy Weir', 'Crown', 2014, 384, 'google'],
  ['9781449373320', 'Designing Data-Intensive Applications', 'Martin Kleppmann', "O'Reilly Media", 2017, 616, 'manual'],
  ['9780134757599', 'Refactoring', 'Martin Fowler', 'Addison-Wesley', 2018, 448, 'google'],
  ['9780735619678', 'Code Complete', 'Steve McConnell', 'Microsoft Press', 2004, 960, 'google'],
  ['9780321965516', "Don't Make Me Think", 'Steve Krug', 'New Riders', 2014, 216, 'google'],
  ['9780465050659', 'The Design of Everyday Things', 'Don Norman', 'Basic Books', 2013, 368, 'google'],
  ['9781591847786', 'Hooked', 'Nir Eyal', 'Portfolio', 2014, 256, 'google'],
  ['9780735214484', 'Range', 'David Epstein', 'Riverhead Books', 2019, 352, 'google'],
  ['9781544512280', "Can't Hurt Me", 'David Goggins', 'Lioncrest Publishing', 2018, 364, 'google'],
  ['9781878424310', 'The Four Agreements', 'Don Miguel Ruiz', 'Amber-Allen Publishing', 1997, 160, 'openlibrary'],
  ['9781585424337', 'Think and Grow Rich', 'Napoleon Hill', 'TarcherPerigee', 2005, 320, 'openlibrary'],
  ['9780671027032', 'How to Win Friends and Influence People', 'Dale Carnegie', 'Pocket Books', 1998, 288, 'google'],
  ['9781544514215', 'The Almanack of Naval Ravikant', 'Eric Jorgenson', 'Magrathea Publishing', 2020, 242, 'google'],
  ['9780804137386', 'Essentialism', 'Greg McKeown', 'Crown Business', 2014, 272, 'google'],
  ['9780345472328', 'Mindset', 'Carol S. Dweck', 'Ballantine Books', 2007, 288, 'google'],
  ['9781603580557', 'Thinking in Systems', 'Donella H. Meadows', 'Chelsea Green', 2008, 240, 'openlibrary'],
  ['9780143127741', 'The Body Keeps the Score', 'Bessel van der Kolk', 'Penguin Books', 2015, 464, 'google'],
  ['9780399588198', 'Born a Crime', 'Trevor Noah', 'Spiegel & Grau', 2016, 304, 'google'],
  ['9781250301697', 'The Silent Patient', 'Alex Michaelides', 'Celadon Books', 2019, 336, 'google'],
  ['9780316556347', 'Circe', 'Madeline Miller', 'Little, Brown', 2018, 400, 'openlibrary'],
  ['9781984822178', 'Normal People', 'Sally Rooney', 'Hogarth', 2019, 288, 'google'],
  ['9780593318171', 'Klara and the Sun', 'Kazuo Ishiguro', 'Knopf', 2021, 320, 'google'],
  ['9781501161933', 'The Seven Husbands of Evelyn Hugo', 'Taylor Jenkins Reid', 'Atria Books', 2017, 400, 'google'],
  ['9780439023528', 'The Hunger Games', 'Suzanne Collins', 'Scholastic', 2010, 374, 'google'],
  ['9780544003415', 'The Lord of the Rings', 'J.R.R. Tolkien', 'Mariner Books', 2012, 1178, 'google'],
  ['9780062073488', 'And Then There Were None', 'Agatha Christie', 'William Morrow', 2011, 272, 'google'],
  ['9780525536291', 'The Vanishing Half', 'Brit Bennett', 'Riverhead Books', 2020, 352, 'google'],
  ['9780312426781', 'Call Me by Your Name', 'André Aciman', 'Picador', 2008, 248, 'google'],
]

/**
 * Extra editions that are NOT in the seeded inventory — used by the demo
 * scenarios (new book, different-edition duplicates, missing metadata).
 */
const DEMO_ROWS = [
  // Story book — not in inventory at start. Penguin Modern Classics edition.
  ['9780141182636', 'The Great Gatsby', 'F. Scott Fitzgerald', 'Penguin Modern Classics', 2000, 192, 'google'],
  // Same book, different publisher → different ISBN, author written surname-first.
  ['9780743273565', 'The Great Gatsby', 'Fitzgerald, F. Scott', 'Scribner', 2004, 180, 'openlibrary'],
  // Different edition of a live book (The Alchemist is live on B-03).
  ['9780061122415', 'The Alchemist: A Fable About Following Your Dream', 'Paulo Coelho', 'HarperOne', 2006, 197, 'openlibrary'],
  // Different edition of a pending book (The Pragmatic Programmer, pending on A-04).
  ['9780201616224', 'The Pragmatic Programmer: From Journeyman to Master', 'Andrew Hunt, David Thomas', 'Addison-Wesley', 1999, 352, 'google'],
  // Brand-new books for extra "normal submission" runs.
  ['9780385547345', 'Lessons in Chemistry', 'Bonnie Garmus', 'Doubleday', 2022, 400, 'google'],
  ['9780593321201', 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'Knopf', 2022, 416, 'google'],
  ['9780063251922', 'Demon Copperhead', 'Barbara Kingsolver', 'Harper', 2022, 560, 'google'],
  ['9781649374042', 'Fourth Wing', 'Rebecca Yarros', 'Entangled: Red Tower Books', 2023, 528, 'google'],
  ['9780063250833', 'Yellowface', 'R.F. Kuang', 'William Morrow', 2023, 336, 'google'],
  // Content-flag demo books (subjects match the LGBTQ+ / Politics flag categories).
  ['9780062060624', 'The Song of Achilles', 'Madeline Miller', 'Ecco', 2012, 378, 'google'],
  ['9781250316776', 'Red, White & Royal Blue', 'Casey McQuiston', "St. Martin's Griffin", 2019, 421, 'google'],
]

/** Subject / category metadata as returned by Google Books & Open Library — drives content flags. */
const SUBJECTS = {
  '9780062060624': ['Fiction', 'Mythology', 'LGBTQ+ fiction', 'Gay romance'],
  '9781250316776': ['Fiction', 'Romance', 'LGBTQ+', 'Political fiction'],
  '9780312426781': ['Fiction', 'Gay fiction', 'Coming of age', 'Sexual content'],
  '9781984822178': ['Fiction', 'Romance', 'Sexual content'],
  '9781501161933': ['Fiction', 'Historical fiction', 'LGBTQ+'],
  '9780451524935': ['Fiction', 'Dystopian', 'Political fiction'],
  '9780451526342': ['Fiction', 'Satire', 'Political fiction'],
  '9780060850524': ['Fiction', 'Dystopian', 'Science fiction'],
  '9780735211292': ['Self-help', 'Habits', 'Personal development'],
  '9780132350884': ['Computers', 'Software engineering'],
  '9780062316097': ['History', 'Anthropology'],
  '9780399590504': ['Biography', 'Memoir', 'Religion'],
  '9780143127741': ['Psychology', 'Trauma', 'Health'],
  '9781544512280': ['Biography', 'Self-help'],
  '9780307387899': ['Fiction', 'Post-apocalyptic'],
  '9780399588198': ['Biography', 'Memoir', 'Politics'],
  '9780141182636': ['Fiction', 'Classics', 'Jazz Age'],
  '9780743273565': ['Fiction', 'Classics'],
  '9780062315007': ['Fiction', 'Fable', 'Spirituality'],
  '9780061122415': ['Fiction', 'Fable', 'Spirituality'],
}
export const subjectsFor = (isbn) => SUBJECTS[isbn] || []

/** Partial record — Open Library returns title/author only; staff must complete the rest. */
const PARTIAL = {
  '9780140449136': { title: 'Crime and Punishment', author: 'Fyodor Dostoevsky', publisher: '', year: '', pages: '', source: 'openlibrary', noCover: true },
}

/** Valid-checksum ISBNs used to demonstrate error states. */
export const ISBN_NOT_FOUND = '9781234567897'
export const ISBN_SERVICE_DOWN = '9798888123454'

const toRecord = ([isbn, title, author, publisher, year, pages, source]) => ({ isbn, title, author, publisher, year, pages, source })

export const CATALOG = ROWS.map(toRecord)
const DEMO = DEMO_ROWS.map(toRecord)

const LOOKUP = new Map([...CATALOG, ...DEMO].map((r) => [r.isbn, r]))

export function findMetadata(isbn13) {
  if (PARTIAL[isbn13]) return { isbn: isbn13, subjects: ['Fiction', 'Classics'], ...PARTIAL[isbn13] }
  const rec = LOOKUP.get(isbn13)
  return rec ? { ...rec, subjects: subjectsFor(isbn13) } : null
}

/** Shown in the scanner + manual-entry screens so the presenter can pick outcomes. */
export const DEMO_ISBNS = [
  { isbn: '9780141182636', label: 'The Great Gatsby', note: 'Penguin edition — new book', hint: 'pending' },
  { isbn: '9780743273565', label: 'The Great Gatsby', note: 'Scribner edition — different ISBN', hint: 'duplicate' },
  { isbn: '9780061122415', label: 'The Alchemist', note: 'Live on B-03 — try B-03 or another shelf', hint: 'duplicate' },
  { isbn: '9780062060624', label: 'The Song of Achilles', note: 'New book — matches flag “LGBTQ+ themes”', hint: 'flag' },
  { isbn: '9781250316776', label: 'Red, White & Royal Blue', note: 'New book — two flag categories', hint: 'flag' },
  { isbn: '9780140449136', label: 'Crime and Punishment', note: 'Partial metadata — complete manually', hint: 'partial' },
  { isbn: '9780385547345', label: 'Lessons in Chemistry', note: 'New book', hint: 'pending' },
  { isbn: '0141182636', label: 'ISBN-10', note: 'Converts to ISBN-13 automatically', hint: 'isbn10' },
  { isbn: ISBN_NOT_FOUND, label: 'Unknown ISBN', note: 'Not found — enter details manually', hint: 'error' },
  { isbn: ISBN_SERVICE_DOWN, label: 'Service outage', note: 'Metadata services unavailable — retry works', hint: 'error' },
]
