/**
 * Content flags — admin-defined categories (e.g. "LGBTQ+ themes") matched
 * against the book's subjects and title. A flag never rejects a book:
 * mode 'hold' routes it to the Flags review queue, mode 'label' only tags it.
 */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function matchFlags(item, categories = []) {
  const haystack = [...(item.subjects || []), item.title || ''].join(' | ')
  const out = []
  for (const c of categories) {
    if (!c.enabled) continue
    const hit = c.keywords.find((k) => k.trim() && new RegExp(`(^|[^a-z0-9])${escapeRegExp(k.trim())}($|[^a-z0-9])`, 'i').test(haystack))
    if (hit) out.push({ id: c.id, name: c.name, mode: c.mode, hue: c.hue, matched: hit })
  }
  return out
}
