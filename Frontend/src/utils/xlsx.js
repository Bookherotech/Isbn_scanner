/**
 * A small styled Excel (.xlsx) writer: one sheet with a title, a subtitle line, a coloured header row, real dates,
 * striped rows, a totals row (SUM formulas), set column widths, a frozen header and filter buttons.
 * No library: the file is a few XML parts in a zip (stored, not compressed).
 *
 * downloadXlsx('report.xlsx', {
 *   sheet: 'Books by day', title: 'Books added, approved and rejected', subtitle: 'Last 14 days · All shelves',
 *   columns: [{ header: 'Date', key: 'date', type: 'date', width: 20 }, { header: 'Added', key: 'added', type: 'number' }],
 *   rows: [{ date: Date (or ms), added: 3 }], totals: true,
 * })
 *
 * Column types: 'text' (default; also for codes like ISBNs, so Excel keeps every digit), 'number', 'date' (a day),
 * 'datetime' (day + time). `width` is in characters; without it the column fits its longest value.
 * With `totals`, number columns get a SUM in the last row, except columns with `total: false` (e.g. a rate).
 */

const INK = 'FF17150F'
const BRAND = 'FFFFD21F'

// cellXfs indices in STYLES below
const S = { title: 1, subtitle: 2, headText: 3, headNum: 4, text: 5, date: 6, num: 7, textAlt: 8, dateAlt: 9, numAlt: 10, totalLabel: 11, totalNum: 12, datetime: 13, datetimeAlt: 14 }

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="ddd, d mmm yyyy"/><numFmt numFmtId="165" formatCode="d mmm yyyy, hh:mm"/></numFmts>
<fonts count="5">
<font><sz val="11"/><color rgb="FF2B2820"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B6455"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFAF8F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1EDE1"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFE3DED0"/></left><right style="thin"><color rgb="FFE3DED0"/></right><top style="thin"><color rgb="FFE3DED0"/></top><bottom style="thin"><color rgb="FFE3DED0"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFE2B500"/></left><right style="thin"><color rgb="FFE2B500"/></right><top style="thin"><color rgb="FFE2B500"/></top><bottom style="medium"><color rgb="${INK}"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFE3DED0"/></left><right style="thin"><color rgb="FFE3DED0"/></right><top style="medium"><color rgb="${INK}"/></top><bottom style="thin"><color rgb="FFE3DED0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="3" fontId="4" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))

/** Excel's day number for the local calendar date of `d` (Date or ms). */
function excelDate(d) {
  const t = new Date(d)
  return (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(1899, 11, 30)) / 86400000
}

/** Excel's day number + fraction of the day for the local date and time of `d` (Date, ms or ISO string). */
function excelDateTime(d) {
  const t = new Date(d)
  return (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()) - Date.UTC(1899, 11, 30)) / 86400000
}

const validTime = (v) => !Number.isNaN(new Date(v).getTime())

function cell(ref, value, style, type) {
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`
  if (type === 'date' && validTime(value)) return `<c r="${ref}" s="${style}"><v>${excelDate(value)}</v></c>`
  if (type === 'datetime' && validTime(value)) return `<c r="${ref}" s="${style}"><v>${excelDateTime(value)}</v></c>`
  if (type === 'number' && Number.isFinite(Number(value))) return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

const FIXED_WIDTH = { date: 20, datetime: 20 }

/** Characters wide: the given width, else the longest of header / values (+ room for the filter button), 10-50. */
function widthOf(c, rows) {
  if (c.width) return c.width
  if (FIXED_WIDTH[c.type]) return Math.max(FIXED_WIDTH[c.type], String(c.header).length + 5)
  const longest = rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? '').length), String(c.header).length + 3)
  return Math.min(50, Math.max(10, longest + 3))
}

function sheetXml({ title, subtitle, columns, rows, totals }) {
  const last = col(columns.length - 1)
  const head = 4 // header row number; rows 1-2 title + subtitle, row 3 spacer
  const first = head + 1
  const end = head + rows.length
  const widths = columns.map((c) => widthOf(c, rows))
  // the subtitle wraps inside the merged cell: one line per sheet width of text (italic 10pt fits ~1.15 chars per unit)
  const subtitleLines = Math.min(4, Math.max(1, Math.ceil(String(subtitle ?? '').length / (widths.reduce((a, b) => a + b, 0) * 1.15))))
  const out = []
  out.push(`<row r="1" ht="30" customHeight="1">${cell('A1', title, S.title)}</row>`)
  out.push(`<row r="2" ht="${subtitleLines * 14 + 4}" customHeight="1">${cell('A2', subtitle, S.subtitle)}</row>`)
  out.push(`<row r="3" ht="8" customHeight="1"/>`)
  out.push(`<row r="${head}" ht="24" customHeight="1">${columns.map((c, i) => cell(`${col(i)}${head}`, c.header, c.type === 'number' ? S.headNum : S.headText)).join('')}</row>`)
  rows.forEach((r, n) => {
    const at = first + n
    const alt = n % 2 === 1
    const style = (t) =>
      t === 'date' ? (alt ? S.dateAlt : S.date) : t === 'datetime' ? (alt ? S.datetimeAlt : S.datetime) : t === 'number' ? (alt ? S.numAlt : S.num) : alt ? S.textAlt : S.text
    out.push(`<row r="${at}" ht="20" customHeight="1">${columns.map((c, i) => cell(`${col(i)}${at}`, r[c.key], style(c.type), c.type)).join('')}</row>`)
  })
  if (totals && rows.length) {
    const at = end + 1
    const cells = columns.map((c, i) => {
      const ref = `${col(i)}${at}`
      if (i === 0) return cell(ref, 'Total', S.totalLabel)
      if (c.type !== 'number' || c.total === false) return `<c r="${ref}" s="${S.totalLabel}"/>`
      const sum = rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)
      return `<c r="${ref}" s="${S.totalNum}"><f>SUM(${col(i)}${first}:${col(i)}${end})</f><v>${sum}</v></c>`
    })
    out.push(`<row r="${at}" ht="24" customHeight="1">${cells.join('')}</row>`)
  }
  const lastRow = end + (totals && rows.length ? 1 : 0)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${last}${Math.max(lastRow, head)}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${head}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${first}" sqref="A${first}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${out.join('')}</sheetData>
${rows.length ? `<autoFilter ref="A${head}:${last}${end}"/>` : ''}
<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="${widths.reduce((a, b) => a + b, 0) > 90 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}

function workbookParts(opts) {
  const sheet = esc(String(opts.sheet || 'Report').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const last = col(opts.columns.length - 1)
  const filter = opts.rows.length
    ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheet.replace(/'/g, "''")}'!$A$4:$${last}$${4 + opts.rows.length}</definedName></definedNames>`
    : ''
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets>${filter}</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': sheetXml(opts),
  }
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
