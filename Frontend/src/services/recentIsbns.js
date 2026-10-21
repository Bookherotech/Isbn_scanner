/**
 * "Recently entered ISBNs" on the Enter ISBN screen: the last 10 ISBNs a staff member typed,
 * newest first, kept in this browser and separately for each signed-in account (shared shop devices).
 * Entry: { isbn, title, at } — title is filled in once Book details has found the book.
 */
const MAX = 10

const keyFor = (user) => `bookhero.recentIsbns.${user?.backendId ?? user?.id ?? 'anon'}`

export function getRecentIsbns(user) {
  try {
    const list = JSON.parse(localStorage.getItem(keyFor(user)))
    return Array.isArray(list) ? list.filter((e) => e && typeof e.isbn === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

function save(user, list) {
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* storage unavailable (private mode): the list is only a convenience */
  }
}

/** Put an ISBN-13 at the top (moving it up if it was already in the list). */
export function addRecentIsbn(user, isbn) {
  const list = getRecentIsbns(user)
  const previous = list.find((e) => e.isbn === isbn)
  save(user, [{ isbn, title: previous?.title || '', at: Date.now() }, ...list.filter((e) => e.isbn !== isbn)])
}

/** Name an ISBN that is already in the list (scanned ISBNs that were never typed are not added). */
export function setRecentIsbnTitle(user, isbn, title) {
  const list = getRecentIsbns(user)
  if (!title || !list.some((e) => e.isbn === isbn)) return
  save(user, list.map((e) => (e.isbn === isbn ? { ...e, title } : e)))
}
