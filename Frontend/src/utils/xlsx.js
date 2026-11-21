/**
 * Styled Excel (.xlsx) writer for BookHero reports. Builds a workbook that reads like a dashboard:
 *
 *   Overview    a warm page of white cards (no gridlines, no row / column headers): a yellow hero with the report
 *               name, filters and export time; KPI cards (big number, a line of context, an optional tiny trend
 *               line); a real Excel chart (columns, bars, or a doughnut with its breakdown list); highlights; and a
 *               link to the full list
 *   <sheet>     the full table: yellow header with filter buttons, light row lines, real dates, coloured status
 *               tags, optional in-cell data bars, a dark totals row; the header stays frozen and repeats on every
 *               printed page
 *   Chart data  hidden; the numbers the chart draws
 *
 * No library: the file is a few XML parts in a zip (stored, not compressed).
 *
 * downloadXlsx('report.xlsx', {
 *   sheet: 'Books by day', title: 'Books added, approved and rejected',
 *   subtitle: 'Last 14 days · All shelves', meta: 'Exported 21 Nov 2026, 13:40',
 *   columns: [{ header: 'Date', key: 'date', type: 'date' }, { header: 'Added', key: 'added', type: 'number' }],
 *   rows: [{ date: Date (or ms / ISO), added: 3 }], totals: true, countLabel: 'Days', bars: true,
 *   tiles: [{ label: 'Added', value: 43, note: '3.1 a day', tone: 'brand', spark: [0, 2, 5], format: 'percent' }],
 *   chart: { type: 'column' | 'bar', title, categories: ['8 Nov'], series: [{ name: 'Added', values: [3], tone: 'brand' }] }
 *       or { type: 'doughnut', title }  (drawn from `breakdown`),
 *   breakdown: { title: 'By status', total: '43 books', items: [{ label: 'Live', value: 20, tone: 'green' }] },
 *   highlights: [{ label: 'Busiest day', value: 'Tue 17 Nov — 27 books' }],
 * })
 *
 * Everything after `bars` is optional: without `tiles` the cards show the row count and the column totals.
 * Column types: 'text' (default; also for codes like ISBNs, so Excel keeps every digit), 'number', 'date' (a day),
 * 'datetime' (day + time). `width` is in characters; without it the column fits its longest value.
 * `tones: { Live: 'green' }` shows those values as coloured tags. Number columns are summed in the totals row,
 * except columns with `total: false` (a rate). Tones: brand, ink, green, red, orange, violet, grey.
 */

// ---------- palette (the app's colours, styles/tokens.css) ----------
const C = {
  ink: '17150F', ink2: '47433A', muted: '6B6659', faint: '9A9483', white: 'FFFFFF',
  paper: 'F6F4EE', hair: 'ECE8DD', zebra: 'FBFAF6', shadow: 'DDD7C7', axis: 'D9D3C3',
  hero: 'FFD21F', heroInk: '4A3B00', bar: 'FFE27A',
}
// strip = card accent, mark = text / dots on white, text = words, soft = tag background, fill = chart colour
const TONES = {
  brand: { strip: 'FFD21F', mark: 'D9A900', text: '4A3B00', soft: 'FFF6CC', fill: 'FFD21F', edge: 'E2B500' },
  ink: { strip: '17150F', mark: '17150F', text: '47433A', soft: 'EFECE4', fill: '2B2820' },
  green: { strip: '1D744A', mark: '1D744A', text: '17623D', soft: 'E3F1E8', fill: '1D744A' },
  red: { strip: 'B4232A', mark: 'B4232A', text: 'B4232A', soft: 'FCECEA', fill: 'C8383F' },
  orange: { strip: 'D9772B', mark: 'D9772B', text: '8A3B06', soft: 'FBE1CC', fill: 'D9772B' },
  violet: { strip: '6B3590', mark: '6B3590', text: '6B3590', soft: 'F3EAF8', fill: '8E5BB5' },
  grey: { strip: '9A9483', mark: '9A9483', text: '3F3B32', soft: 'EFECE4', fill: 'B9B3A3' },
}
const CYCLE = ['brand', 'green', 'ink', 'red', 'violet', 'orange', 'grey']
const toneOf = (name, i = 0) => TONES[name] || TONES[CYCLE[i % CYCLE.length]]

// ---------- helpers ----------
const esc = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // not allowed in XML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))
const ref = (r, c) => `${col(c)}${r}`
const quoteSheet = (name) => `'${name.replace(/'/g, "''")}'`
const isSummed = (c) => c.type === 'number' && c.total !== false
const sumOf = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)

/** [{ label, value }] counts of `key` (a field name, or a function of the row), biggest first. */
export function countBy(rows, key) {
  const counts = new Map()
  for (const row of rows) {
    const label = (typeof key === 'function' ? key(row) : row[key]) || 'Not set'
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

/** Excel's day number for the local calendar date of `d` (Date, ms or ISO string). */
function excelDate(d) {
  const t = new Date(d)
  return (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(1899, 11, 30)) / 86400000
}

/** Excel's day number + fraction of the day for the local date and time of `d`. */
function excelDateTime(d) {
  const t = new Date(d)
  return (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()) - Date.UTC(1899, 11, 30)) / 86400000
}

const validTime = (v) => !Number.isNaN(new Date(v).getTime())

function cellXml(r, c, value, s, type) {
  const at = ref(r, c)
  if (value === null || value === undefined || value === '') return `<c r="${at}" s="${s}"/>`
  if (type === 'date' && validTime(value)) return `<c r="${at}" s="${s}"><v>${excelDate(value)}</v></c>`
  if (type === 'datetime' && validTime(value)) return `<c r="${at}" s="${s}"><v>${excelDateTime(value)}</v></c>`
  if (type === 'number' && value !== true && Number.isFinite(Number(value))) return `<c r="${at}" s="${s}"><v>${Number(value)}</v></c>`
  return `<c r="${at}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

/** A tiny trend line out of block characters (▁▂▃▄▅▆▇█); long series are summed into at most `max` bars. */
function sparkline(values, max = 16) {
  let v = values.map((x) => Number(x) || 0)
  if (v.length > max) {
    const size = Math.ceil(v.length / max)
    v = Array.from({ length: Math.ceil(v.length / size) }, (_, i) => v.slice(i * size, (i + 1) * size).reduce((a, b) => a + b, 0))
  }
  const top = Math.max(0, ...v)
  return v.map((x) => '▁▂▃▄▅▆▇█'[top ? Math.round((x / top) * 7) : 0]).join('')
}

// ---------- styles: registered as they are used, so indexes cannot drift ----------
function createStyles() {
  const fonts = []
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  const formats = []
  const add = (list, xml) => {
    const i = list.indexOf(xml)
    return i >= 0 ? i : list.push(xml) - 1
  }
  const fontXml = ({ sz = 11, color = C.ink2, b, i, u, name = 'Calibri' } = {}) =>
    `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}${u ? '<u/>' : ''}<sz val="${sz}"/><color rgb="FF${color}"/><name val="${name}"/><family val="${name === 'Georgia' ? 1 : 2}"/></font>`
  add(fonts, fontXml()) // font 0: the workbook default (column widths are measured in it)
  const fillXml = (f) =>
    f.gradient
      ? `<fill><gradientFill degree="${f.degree ?? 0}"><stop position="0"><color rgb="FF${f.gradient[0]}"/></stop><stop position="1"><color rgb="FF${f.gradient[1]}"/></stop></gradientFill></fill>`
      : `<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`
  const side = (name, s) => (s ? `<${name} style="${s[0]}"><color rgb="FF${s[1]}"/></${name}>` : `<${name}/>`)
  const borderXml = (b) => `<border>${side('left', b.l)}${side('right', b.r)}${side('top', b.t)}${side('bottom', b.b)}<diagonal/></border>`
  const BUILT_IN = { General: 0, '#,##0': 3, '0%': 9 }
  const formatId = (code) => (code in BUILT_IN ? BUILT_IN[code] : 164 + add(formats, code))
  /** A cell style: { font: { sz, color, b, i, u, name }, fill: 'RRGGBB' | { gradient: [a, b] }, border: { l, r, t, b: [style, colour] }, fmt, h, v, indent, wrap, shrink } */
  function xf({ font, fill, border, fmt = 'General', h, v = 'center', indent, wrap, shrink } = {}) {
    const ids = `numFmtId="${formatId(fmt)}" fontId="${add(fonts, fontXml(font))}" fillId="${fill ? add(fills, fillXml(fill)) : 0}" borderId="${border ? add(borders, borderXml(border)) : 0}"`
    const alignment = `<alignment${h ? ` horizontal="${h}"` : ''} vertical="${v}"${indent ? ` indent="${indent}"` : ''}${wrap ? ' wrapText="1"' : ''}${shrink ? ' shrinkToFit="1"' : ''}/>`
    return add(xfs, `<xf ${ids} xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`)
  }
  const xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${formats.length ? `<numFmts count="${formats.length}">${formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(code)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  return { xf, xml }
}

// ---------- a sheet's rows, filled cell by cell ----------
function createSheet() {
  const rows = new Map()
  const merges = []
  const rowOf = (r) => {
    if (!rows.has(r)) rows.set(r, { ht: 0, cells: new Map() })
    return rows.get(r)
  }
  const sheet = {
    merges,
    height(r, ht) {
      rowOf(r).ht = ht
    },
    put(r, c, value, s, type) {
      rowOf(r).cells.set(c, cellXml(r, c, value, s, type))
    },
    raw(r, c, xml) {
      rowOf(r).cells.set(c, xml)
    },
    /** Style r1..r2 x c1..c2 alike, put `value` in the top-left cell and merge the block. */
    block(r1, c1, r2, c2, s, value = '', type) {
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) sheet.put(r, c, r === r1 && c === c1 ? value : '', s, type)
      if (r2 > r1 || c2 > c1) merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`)
    },
    lastRow: () => Math.max(1, ...rows.keys()),
    rowsXml: () =>
      [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([r, row]) => `<row r="${r}"${row.ht ? ` ht="${row.ht}" customHeight="1"` : ''}>${[...row.cells.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x).join('')}</row>`)
        .join(''),
    mergesXml: () => (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''),
  }
  return sheet
}

const WORKSHEET = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const FOOTER = '<headerFooter><oddFooter>&amp;L&amp;8&amp;K9A9483BookHero Inventory&amp;R&amp;8&amp;K9A9483Page &amp;P of &amp;N</oddFooter></headerFooter>'

// ---------- Overview sheet ----------
const GRID = 24 // grid columns B..Y; A and Z are page margins
const L = 1
const R = GRID

function defaultTiles(o) {
  const counted = { label: o.countLabel || 'Rows', value: o.rows.length, tone: 'ink' }
  return [counted, ...o.columns.filter(isSummed).map((c, i) => ({ label: c.header, value: sumOf(o.rows, c.key), tone: CYCLE[i % CYCLE.length] }))]
}

/** The chart to draw, normalised; null when there is nothing to draw. */
function prepareChart(o) {
  const ch = o.chart
  if (!ch || !o.rows.length) return null
  if (ch.type === 'doughnut') {
    const all = (o.breakdown?.items || []).filter((it) => Number(it.value) > 0)
    if (!all.length) return null
    const items = all.length > 7 ? [...all.slice(0, 6), { label: 'Other', value: all.slice(6).reduce((s, it) => s + it.value, 0), tone: 'grey' }] : all
    return {
      type: 'doughnut',
      title: ch.title,
      items,
      categories: items.map((it) => it.label),
      series: [{ name: ch.title || 'Count', values: items.map((it) => it.value) }],
      colors: items.map((it, i) => toneOf(it.tone, i).fill),
    }
  }
  if (!ch.categories?.length || !ch.series?.length) return null
  const flip = ch.type === 'bar' // horizontal bars are drawn bottom-up: reverse so the first item sits on top
  const order = (list) => (flip ? [...list].reverse() : list)
  return {
    type: flip ? 'bar' : 'column',
    title: ch.title,
    categories: order(ch.categories.map(String)),
    series: order(ch.series.map((s, i) => ({ name: s.name, values: order(s.values), tone: toneOf(s.tone, i) }))),
  }
}

/** The list beside a doughnut: a dot in the slice colour, the label, the count and its share. */
function listCard(sh, S, breakdown, items, r0, a, b, H) {
  const white = S.xf({ fill: C.white })
  for (let r = r0; r < r0 + H; r++) for (let c = a; c <= b; c++) sh.put(r, c, '', white)
  sh.block(r0 + 1, a, r0 + 1, b - 4, S.xf({ font: { sz: 12, b: true, color: C.ink, name: 'Georgia' }, fill: C.white, indent: 1 }), breakdown?.title || '')
  sh.block(r0 + 1, b - 3, r0 + 1, b, S.xf({ font: { sz: 9.5, color: C.muted }, fill: C.white, h: 'right', indent: 1 }), breakdown?.total || '')
  const line = { b: ['thin', C.hair] }
  const label = S.xf({ font: { sz: 10.5, color: C.ink2 }, fill: C.white, border: line })
  const count = S.xf({ font: { sz: 10.5, b: true, color: C.ink }, fill: C.white, border: line, h: 'right', fmt: '#,##0' })
  const share = S.xf({ font: { sz: 9.5, color: C.muted }, fill: C.white, border: line, h: 'right', indent: 1, fmt: '0%' })
  const total = items.reduce((s, it) => s + it.value, 0)
  items.forEach((it, i) => {
    const r = r0 + 3 + i
    sh.put(r, a, '●', S.xf({ font: { sz: 11, color: toneOf(it.tone, i).mark }, fill: C.white, border: line, h: 'center' }))
    sh.block(r, a + 1, r, b - 5, label, it.label)
    sh.block(r, b - 4, r, b - 2, count, it.value, 'number')
    sh.block(r, b - 1, r, b, share, total ? it.value / total : 0, 'number')
  })
}

function overviewXml(o, S, dataName, chart, reportRows = () => {}) {
  const sh = createSheet()
  const paper = S.xf({ fill: C.paper })
  const white = S.xf({ fill: C.white })
  const shadow = S.xf({ fill: C.white, border: { b: ['thin', C.shadow] } })

  // hero: a yellow band with the report name
  const hero = (font, a = {}) => S.xf({ font, fill: C.hero, ...a })
  const heroPad = hero()
  sh.height(1, 18)
  sh.height(2, 14)
  sh.block(2, L, 2, R, heroPad)
  sh.height(3, 20)
  sh.block(3, L, 3, L + 13, hero({ sz: 9, b: true, color: C.heroInk }, { indent: 2, v: 'bottom' }), 'BOOKHERO  ·  INVENTORY REPORT')
  sh.block(3, L + 14, 3, R, hero({ sz: 9, b: true, color: C.heroInk }, { h: 'right', indent: 2, v: 'bottom' }), String(o.meta || '').toUpperCase())
  sh.height(4, 46)
  sh.block(4, L, 4, R, hero({ sz: 26, b: true, color: C.ink, name: 'Georgia' }, { indent: 2 }), o.title)
  const subLines = Math.min(3, Math.max(1, Math.ceil(String(o.subtitle || '').length / 125)))
  sh.height(5, subLines * 16 + 4)
  sh.block(5, L, 5, R, hero({ sz: 11, color: C.ink2 }, { indent: 2, v: 'top', wrap: true }), o.subtitle)
  sh.height(6, 16)
  sh.block(6, L, 6, R, heroPad)
  sh.height(7, 20)

  // KPI cards: a coloured strip, the label, a big number, an optional trend line, a line of context
  const tiles = (o.tiles?.length ? o.tiles : defaultTiles(o)).slice(0, 5)
  const k = tiles.length
  const w = Math.floor((GRID - (k - 1)) / k)
  const spare = GRID - (k - 1) - w * k
  const withSpark = tiles.some((t) => t.spark?.length)
  const top = 8
  const at = { strip: top, label: top + 1, value: top + 2, spark: top + 3, note: top + (withSpark ? 4 : 3) }
  const pad = at.note + 1
  sh.height(at.strip, 5)
  sh.height(at.label, 24)
  sh.height(at.value, 40)
  if (withSpark) sh.height(at.spark, 18)
  sh.height(at.note, 20)
  sh.height(pad, 10)
  const label = S.xf({ font: { sz: 9, b: true, color: C.muted }, fill: C.white, indent: 1, v: 'bottom', shrink: true })
  tiles.forEach((t, i) => {
    const tone = toneOf(t.tone, i)
    const a = L + i * (w + 1)
    const b = a + w - 1 + (i === k - 1 ? spare : 0)
    sh.block(at.strip, a, at.strip, b, S.xf({ fill: tone.strip }))
    sh.block(at.label, a, at.label, b, label, String(t.label).toUpperCase())
    sh.block(at.value, a, at.value, b, S.xf({ font: { sz: 26, b: true, color: C.ink }, fill: C.white, h: 'left', indent: 1, fmt: t.format === 'percent' ? '0%' : '#,##0' }), t.value ?? '–', 'number')
    if (withSpark) sh.block(at.spark, a, at.spark, b, S.xf({ font: { sz: 11, color: tone.mark, name: 'Segoe UI Symbol' }, fill: C.white, indent: 1, v: 'bottom' }), t.spark?.length ? sparkline(t.spark) : '')
    sh.block(at.note, a, at.note, b, S.xf({ font: { sz: 9.5, color: tone.text }, fill: C.white, indent: 1, shrink: true }), t.note || '')
    sh.block(pad, a, pad, b, shadow)
  })
  let r = pad + 1
  sh.height(r, 20)
  r += 1

  // chart card (a doughnut gets its breakdown list beside it)
  if (chart) {
    const H = 16
    for (let i = 0; i < H; i++) sh.height(r + i, 18)
    const withList = chart.type === 'doughnut'
    chart.anchor = { c1: L, r1: r - 1, c2: withList ? L + 12 : R + 1, r2: r - 1 + H }
    if (withList) listCard(sh, S, o.breakdown, chart.items, r, L + 13, R, H)
    r += H
    sh.height(r, 20)
    r += 1
  } else if (!o.rows.length) {
    sh.height(r, 44)
    sh.block(r, L, r, R, S.xf({ font: { sz: 11, i: true, color: C.muted }, fill: C.white, indent: 2 }), 'No rows for these filters.')
    r += 1
    sh.height(r, 20)
    r += 1
  }

  // highlights: short sentences with a yellow bar on the left
  if (o.highlights?.length) {
    const bar = { l: ['thick', C.hero] }
    sh.height(r, 10)
    sh.block(r, L, r, R, S.xf({ fill: C.white, border: bar }))
    r += 1
    sh.height(r, 26)
    sh.block(r, L, r, R, S.xf({ font: { sz: 12, b: true, color: C.ink, name: 'Georgia' }, fill: C.white, border: bar, indent: 2 }), 'Highlights')
    r += 1
    for (const h of o.highlights) {
      sh.height(r, 22)
      sh.block(r, L, r, L + 6, S.xf({ font: { sz: 10, color: C.muted }, fill: C.white, border: bar, indent: 2 }), h.label)
      sh.block(r, L + 7, r, R, S.xf({ font: { sz: 11, b: true, color: C.ink }, fill: C.white, indent: 1 }), h.value)
      r += 1
    }
    sh.height(r, 10)
    sh.block(r, L, r, R, S.xf({ fill: C.white, border: { ...bar, b: ['thin', C.shadow] } }))
    r += 1
    sh.height(r, 20)
    r += 1
  }

  // footer: a link to the full list
  sh.height(r, 22)
  sh.block(r, L, r, L + 13, S.xf({ font: { sz: 10.5, b: true, u: true, color: C.ink }, fill: C.paper }), `Open the full list  ›  ${dataName}`)
  sh.block(r, L + 14, r, R, S.xf({ font: { sz: 9.5, color: C.faint }, fill: C.paper, h: 'right' }), `${o.rows.length.toLocaleString('en')} ${String(o.countLabel || 'rows').toLowerCase()}  ·  BookHero Inventory`)
  reportRows(r + 1) // the print area ends one row below the footer
  const link = `<hyperlinks><hyperlink ref="${ref(r, L)}" location="${esc(`${quoteSheet(dataName)}!A1`)}" display="${esc(dataName)}"/></hyperlinks>`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet ${WORKSHEET}><sheetPr><tabColor rgb="FF${C.hero}"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ref(sh.lastRow(), R + 1)}"/><sheetViews><sheetView showGridLines="0" showRowColHeaders="0" tabSelected="1" zoomScale="100" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="3" customWidth="1" style="${paper}"/><col min="2" max="${GRID + 1}" width="4.7" customWidth="1" style="${paper}"/><col min="${GRID + 2}" max="16384" width="9" customWidth="1" style="${paper}"/></cols><sheetData>${sh.rowsXml()}</sheetData>${sh.mergesXml()}${link}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.5" header="0.2" footer="0.25"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/>${FOOTER}${chart ? '<drawing r:id="rId1"/>' : ''}</worksheet>`
}

// ---------- Data sheet ----------
const FIXED_WIDTH = { date: 20, datetime: 21 }

/** Characters wide: the given width, else the longest of header / values, with room for the filter button (11-50). */
function widthOf(c, rows) {
  const head = String(c.header).length + 7
  if (c.width) return Math.max(c.width, head)
  if (FIXED_WIDTH[c.type]) return Math.max(FIXED_WIDTH[c.type], head)
  const longest = rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? '').length + 4), head)
  return Math.min(50, Math.max(11, longest))
}

const FMT = { date: 'ddd, d mmm yyyy', datetime: 'd mmm yyyy, hh:mm', number: '#,##0;-#,##0;"–"' }

function dataXml(o, S) {
  const { columns, rows } = o
  const last = columns.length - 1
  const head = 4
  const first = head + 1
  const end = head + rows.length
  const totalRow = o.totals && rows.length ? end + 1 : 0
  const widths = columns.map((c) => widthOf(c, rows))
  const sh = createSheet()

  sh.height(1, 34)
  sh.block(1, 0, 1, last, S.xf({ font: { sz: 15, b: true, color: C.ink, name: 'Georgia' }, indent: 1, v: 'bottom' }), o.title)
  const line = [o.subtitle, o.meta].filter(Boolean).join('   ·   ')
  const lines = Math.min(4, Math.max(1, Math.ceil(line.length / (widths.reduce((a, b) => a + b, 0) * 1.1))))
  sh.height(2, lines * 13 + 7)
  sh.block(2, 0, 2, last, S.xf({ font: { sz: 9.5, color: C.muted }, indent: 1, v: 'top', wrap: true }), line)
  sh.height(3, 10)

  sh.height(head, 26)
  const header = (num) => S.xf({ font: { sz: 10.5, b: true, color: C.ink }, fill: C.hero, border: { b: ['thin', C.ink] }, h: num ? 'right' : 'left', indent: num ? 2 : 1 })
  columns.forEach((c, i) => sh.put(head, i, c.header, header(c.type === 'number')))

  const body = (type, alt) =>
    S.xf({ font: { sz: 10.5, color: C.ink2 }, fill: alt ? C.zebra : null, border: { b: ['thin', C.hair] }, fmt: FMT[type] || 'General', h: type === 'number' ? 'right' : 'left', indent: type === 'number' ? 2 : 1 })
  const inset = ['medium', C.white]
  const tag = (tone) => S.xf({ font: { sz: 9.5, b: true, color: tone.text }, fill: tone.soft, border: { l: inset, r: inset, t: inset, b: inset }, h: 'center' })
  rows.forEach((row, k) => {
    const r = first + k
    sh.height(r, 20)
    columns.forEach((c, i) => {
      const v = row[c.key]
      const tone = c.tones && TONES[c.tones[v]]
      sh.put(r, i, v, tone ? tag(tone) : body(c.type || 'text', k % 2 === 1), c.type)
    })
  })
  if (totalRow) {
    sh.height(totalRow, 26)
    const label = S.xf({ font: { sz: 11, b: true, color: C.white }, fill: C.ink, indent: 1 })
    const sum = S.xf({ font: { sz: 11, b: true, color: C.white }, fill: C.ink, h: 'right', indent: 2, fmt: FMT.number })
    columns.forEach((c, i) => {
      if (i === 0) sh.put(totalRow, i, 'Total', label)
      else if (isSummed(c)) sh.raw(totalRow, i, `<c r="${ref(totalRow, i)}" s="${sum}"><f>SUM(${col(i)}${first}:${col(i)}${end})</f><v>${sumOf(rows, c.key)}</v></c>`)
      else sh.put(totalRow, i, '', label)
    })
  }
  if (!rows.length) {
    sh.height(first, 26)
    sh.block(first, 0, first, last, S.xf({ font: { sz: 10.5, i: true, color: C.muted }, indent: 1 }), 'No rows for these filters.')
  }

  // data bars behind the numbers (yellow, like the app's charts); 0 = no bar
  const bars =
    o.bars && rows.length > 1
      ? columns
          .map((c, i) =>
            c.type === 'number'
              ? `<conditionalFormatting sqref="${col(i)}${first}:${col(i)}${end}"><cfRule type="dataBar" priority="${i + 1}"><dataBar minLength="0" maxLength="100"><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FF${C.bar}"/></dataBar></cfRule></conditionalFormatting>`
              : '',
          )
          .join('')
      : ''
  const wide = widths.reduce((a, b) => a + b, 0) > 90
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet ${WORKSHEET}><sheetPr><tabColor rgb="FF${C.ink}"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ref(sh.lastRow(), last)}"/><sheetViews><sheetView showGridLines="0" zoomScale="100" workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${first}" sqref="A${first}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sh.rowsXml()}</sheetData>${rows.length ? `<autoFilter ref="A${head}:${ref(end, last)}"/>` : ''}${sh.mergesXml()}${bars}<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="${wide ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${FOOTER}</worksheet>`
}

// ---------- chart (on Overview) and its hidden numbers ----------
function chartDataXml(ch) {
  const sh = createSheet()
  sh.put(1, 0, 'Category', 0)
  ch.series.forEach((s, j) => sh.put(1, j + 1, s.name, 0))
  ch.categories.forEach((c, i) => {
    sh.put(i + 2, 0, c, 0)
    ch.series.forEach((s, j) => sh.put(i + 2, j + 1, Number(s.values[i]) || 0, 0, 'number'))
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet ${WORKSHEET}><sheetData>${sh.rowsXml()}</sheetData></worksheet>`
}

function chartXml(ch, sheet) {
  const q = quoteSheet(sheet)
  const n = ch.categories.length
  const strCache = (vals) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`
  const numCache = (vals) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('')}</c:numCache>`
  const run = (sz, color, b, face = 'Calibri') => `sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${face}"/>`
  const txPr = (sz, color, b) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr ${run(sz, color, b)}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
  const layout = (x, y, w, h) => `<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="${x}"/><c:y val="${y}"/><c:w val="${w}"/><c:h val="${h}"/></c:manualLayout></c:layout>`
  const title = ch.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr ${run(1200, C.ink, true, 'Georgia')}</a:defRPr></a:pPr><a:r><a:rPr lang="en-US" ${run(1200, C.ink, true, 'Georgia')}</a:rPr><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.025"/><c:y val="0.04"/></c:manualLayout></c:layout><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>'
  const name = (j) => `<c:tx><c:strRef><c:f>${q}!$${col(j + 1)}$1</c:f>${strCache([ch.series[j].name])}</c:strRef></c:tx>`
  const cat = `<c:cat><c:strRef><c:f>${q}!$A$2:$A$${n + 1}</c:f>${strCache(ch.categories)}</c:strRef></c:cat>`
  const val = (j) => `<c:val><c:numRef><c:f>${q}!$${col(j + 1)}$2:$${col(j + 1)}$${n + 1}</c:f>${numCache(ch.series[j].values)}</c:numRef></c:val>`
  let plot
  let legend = ''
  if (ch.type === 'doughnut') {
    const slices = ch.colors
      .map((c, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln w="28575"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`)
      .join('')
    plot = `${layout(0.12, 0.16, 0.76, 0.78)}<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${name(0)}${slices}${cat}${val(0)}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="60"/></c:doughnutChart>`
  } else {
    const bar = ch.type === 'bar'
    const labels = bar
      ? `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, C.ink2, true)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
      : ''
    const series = ch.series
      .map((s, j) => {
        const line = s.tone.edge ? `<a:ln w="6350"><a:solidFill><a:srgbClr val="${s.tone.edge}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>'
        return `<c:ser><c:idx val="${j}"/><c:order val="${j}"/>${name(j)}<c:spPr><a:solidFill><a:srgbClr val="${s.tone.fill}"/></a:solidFill>${line}</c:spPr><c:invertIfNegative val="0"/>${labels}${cat}${val(j)}</c:ser>`
      })
      .join('')
    const twoAxes = '<c:axId val="50010"/><c:axId val="50020"/>'
    const catAx = `<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${bar ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${C.axis}"/></a:solidFill></a:ln></c:spPr>${txPr(900, C.muted)}<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    const grid = bar ? '' : `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${C.hair}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`
    const valAx = `<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${bar ? 1 : 0}"/><c:axPos val="${bar ? 'b' : 'l'}"/>${grid}<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, C.faint)}<c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
    plot = `${bar ? layout(0.2, 0.17, 0.72, 0.78) : layout(0.055, 0.2, 0.92, 0.66)}<c:barChart><c:barDir val="${bar ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="${bar ? 45 : 60}"/><c:overlap val="-12"/>${twoAxes}</c:barChart>${catAx}${valAx}`
    if (ch.series.length > 1) {
      legend = `<c:legend><c:legendPos val="t"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.55"/><c:y val="0.035"/><c:w val="0.43"/><c:h val="0.09"/></c:manualLayout></c:layout><c:overlay val="0"/>${txPr(950, C.ink2)}</c:legend>`
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="1"/><c:chart>${title}<c:plotArea>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, C.muted)}</c:chartSpace>`
}

function drawingXml({ c1, r1, c2, r2 }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`
}

// ---------- the workbook ----------
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const rels = (list) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : `${REL}/${type}`}" Target="${target}"/>`).join('')}</Relationships>`

/** A valid sheet name that is not taken by Overview / Chart data. */
function dataSheetName(name) {
  const clean = String(name || '').replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Data'
  return ['overview', 'chart data'].includes(clean.toLowerCase()) ? `${clean} list` : clean
}

function workbookParts(o) {
  const S = createStyles()
  const dataName = dataSheetName(o.sheet)
  const chart = prepareChart(o)
  let overviewRows = 1
  const sheets = [
    { name: 'Overview', xml: overviewXml(o, S, dataName, chart, (n) => (overviewRows = n)) },
    { name: dataName, xml: dataXml(o, S) },
    ...(chart ? [{ name: 'Chart data', xml: chartDataXml(chart), hidden: true }] : []),
  ]
  const last = col(o.columns.length - 1)
  const qd = esc(quoteSheet(dataName))
  const names = [
    o.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">${qd}!$A$4:$${last}$${4 + o.rows.length}</definedName>` : '',
    `<definedName name="_xlnm.Print_Titles" localSheetId="1">${qd}!$4:$4</definedName>`,
    `<definedName name="_xlnm.Print_Area" localSheetId="0">Overview!$A$1:$${col(R + 1)}$${overviewRows}</definedName>`,
  ].join('')
  const type = (t) => `application/vnd.openxmlformats-officedocument.${t}`
  const overrides = [
    ['/xl/workbook.xml', type('spreadsheetml.sheet.main+xml')],
    ['/xl/styles.xml', type('spreadsheetml.styles+xml')],
    ...sheets.map((_, i) => [`/xl/worksheets/sheet${i + 1}.xml`, type('spreadsheetml.worksheet+xml')]),
    ...(chart ? [['/xl/drawings/drawing1.xml', type('drawing+xml')], ['/xl/charts/chart1.xml', type('drawingml.chart+xml')]] : []),
  ]
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([part, ct]) => `<Override PartName="${part}" ContentType="${ct}"/>`).join('')}</Types>`,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${WORKSHEET}><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${names}</definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': rels([...sheets.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]), ['rIdStyles', 'styles', 'styles.xml']]),
    'xl/styles.xml': S.xml(), // after the sheets: they register the styles they use
  }
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = s.xml
  })
  if (chart) {
    files['xl/worksheets/_rels/sheet1.xml.rels'] = rels([['rId1', 'drawing', '../drawings/drawing1.xml']])
    files['xl/drawings/drawing1.xml'] = drawingXml(chart.anchor)
    files['xl/drawings/_rels/drawing1.xml.rels'] = rels([['rId1', 'chart', '../charts/chart1.xml']])
    files['xl/charts/chart1.xml'] = chartXml(chart, 'Chart data')
  }
  return files
}

// ---------- zip (stored) ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files) {
  const enc = new TextEncoder()
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const parts = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(text)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), nameBytes, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(10, 0, true)
    entry.setUint16(12, time, true)
    entry.setUint16(14, date, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, nameBytes.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const size = central.reduce((a, b) => a + b.length, 0)
  const endRecord = new DataView(new ArrayBuffer(22))
  endRecord.setUint32(0, 0x06054b50, true)
  endRecord.setUint16(8, Object.keys(files).length, true)
  endRecord.setUint16(10, Object.keys(files).length, true)
  endRecord.setUint32(12, size, true)
  endRecord.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(endRecord.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** The workbook as a Blob (see the module comment for `opts`). */
export function xlsxBlob(opts) {
  return zip(workbookParts(opts))
}

export function downloadXlsx(filename, opts) {
  const url = URL.createObjectURL(xlsxBlob(opts))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
