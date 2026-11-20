import { useEffect, useState } from 'react'

/**
 * The store's genres, each with its categories, and the languages. The real lists come from the backend
 * (GET /api/staff/genres/ or /api/admin/genres/) in the store's Shopify tag spelling; these defaults
 * (mirror of Backend/inventory/constants/genre.py) are only shown until that loads or when it fails.
 */
const TREE = {
  Kids: ['Age 0-3', 'Age 4-8', 'Age 9-12', 'Age 13-15', 'Age 16-18'],
  Fiction: ['Action', 'Adventure', 'Classics', 'Comedy', 'Crime', 'Drama', 'General Fiction', 'Historical', 'Horror', 'Mystery', 'Romance', 'Sci-Fi / Science Fiction', 'Thriller'],
  Nonfiction: [
    'Architecture', 'Art', 'Autobiography', 'Biography', 'Business', 'Cooking', 'Encyclopedia', 'Finance', 'Gardening', 'Health', 'History',
    'Information Technology', 'Journalism', 'Marketing', 'Music', 'Nutrition', 'Philosophy', 'Politics', 'Science', 'Self Help', 'Sports', 'Travel',
  ],
  Education: [],
  'Coffee Table Books': [],
  Manga: [],
  'Graphic Novel': [],
}
const DEFAULTS = { genres: Object.entries(TREE).map(([name, subs]) => ({ name, subs })), languages: ['Arabic', 'French', 'Spanish'] }

let cached = null

/** { genres: [{ name, subs }], languages } for the pickers. `load` is the role's API call (staffApi.getGenres / adminApi.getGenres). */
export function useGenres(load) {
  const [lists, setLists] = useState(cached || DEFAULTS)
  useEffect(() => {
    let alive = true
    load()
      .then((res) => {
        cached = res
        if (alive) setLists(res)
      })
      .catch(() => {}) // keep the defaults
    return () => {
      alive = false
    }
  }, [load])
  return lists
}

/** The list, plus the current value when it is no longer in it (so a saved value still shows). */
export function withCurrent(list, value) {
  return value && !list.includes(value) ? [...list, value] : list
}
