import { comovingMpc } from '../astro/cosmology.js'
const numeric = ['ra', 'dec', 'mpc', 'z', 'err', 'energy']
const aliases = {
  ra: ['ra', 'ra_deg', 'raj2000', 'ra_icrs', 'right_ascension'], dec: ['dec', 'dec_deg', 'dej2000', 'dec_icrs', 'declination'],
  mpc: ['mpc', 'distance_mpc', 'dist_mpc', 'distance'], z: ['z', 'redshift', 'z_spec'],
  err: ['err', 'angular_error_deg', 'ang_err', 'sigma_deg', 'angerr'], energy: ['energy', 'energy_gev'],
  name: ['name', 'object', 'source_name', 'source', 'id'], cls: ['cls', 'class'], assoc: ['assoc', 'association'], type: ['type'],
}
function number(value) { return value === '' || value === null || value === undefined ? NaN : Number(value) }
/** RFC 4180 quoting, including embedded newlines; blank and comment records are ignored. */
export function csvRecords(text) {
  const rows = []
  let row = [], value = '', quoted = false
  const finish = () => { row.push(value.trim()); if (row.some(Boolean) && !row[0].startsWith('#')) rows.push(row); row = []; value = '' }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(value.trim()); value = '' }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; finish() }
    else value += char
  }
  if (quoted) throw Error('CSV has an unterminated quoted field')
  if (value || row.length) finish()
  return rows
}
export function parseCSVTable(text, meta = {}) {
  const records = csvRecords(text.replace(/^\uFEFF/, ''))
  if (!records.length) throw Error('Catalog is empty')
  const headers = records.shift().map(key => key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const indices = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex(header => names.includes(header))]))
  if (indices.ra < 0 || indices.dec < 0) throw Error('Catalog is missing RA/Dec columns')
  const length = records.length
  const columns = Object.fromEntries(numeric.map(key => [key, new Float32Array(length).fill(NaN)]))
  const strings = Object.fromEntries(['name', 'cls', 'assoc', 'type'].map(key => [key, new Array(length).fill('')]))
  const kpcIndex = headers.findIndex(header => ['kpc', 'distance_kpc', 'dist_kpc'].includes(header))
  for (let i = 0; i < length; i++) {
    const record = records[i]
    if (record.length !== headers.length) throw Error(`Catalog row ${i + 2} has ${record.length} fields; expected ${headers.length}`)
    for (const key of numeric) columns[key][i] = number(record[indices[key]])
    for (const key of Object.keys(strings)) strings[key][i] = record[indices[key]] || ''
    strings.name[i] ||= `Object ${i + 1}`
    if (!Number.isFinite(columns.mpc[i])) {
      if (kpcIndex >= 0) columns.mpc[i] = number(record[kpcIndex]) / 1000
      else if (Number.isFinite(columns.z[i])) columns.mpc[i] = comovingMpc(columns.z[i])
    }
  }
  return validateTable({ length, columns, strings, meta })
}
export function jsonToTable(rows, meta = {}) {
  if (!Array.isArray(rows)) throw Error('JSON catalog must contain a row array')
  const columns = Object.fromEntries(numeric.map(key => [key, new Float32Array(rows.length).fill(NaN)]))
  const stringKeys = ['name', 'cls', 'assoc', 'type', 'distance_method', 'distance_source', 'provenance']
  const strings = Object.fromEntries(stringKeys.map(key => [key, rows.map(row => String(row[key] ?? ''))]))
  rows.forEach((row, i) => {
    for (const key of numeric) columns[key][i] = number(row[key])
    if (!Number.isFinite(columns.mpc[i])) columns.mpc[i] = number(row.kpc) / 1000
    strings.name[i] ||= `Object ${i + 1}`
  })
  return validateTable({ length: rows.length, columns, strings, meta })
}
export function validateTable(table) {
  if (!Number.isInteger(table.length) || table.length < 0 || table.length > 5_000_000) throw Error('Invalid catalog row count')
  if (!table.columns?.ra || !table.columns?.dec) throw Error('Catalog must have RA and Dec')
  for (const [key, column] of Object.entries(table.columns)) if (!(column instanceof Float32Array) || column.length !== table.length) throw Error(`Invalid numeric column ${key}`)
  for (const [key, values] of Object.entries(table.strings || {})) if (!Array.isArray(values) || values.length !== table.length || values.some(value => typeof value !== 'string')) throw Error(`Invalid string column ${key}`)
  for (let i = 0; i < table.length; i++) {
    if (!Number.isFinite(table.columns.ra[i]) || table.columns.ra[i] < 0 || table.columns.ra[i] > 360 || !Number.isFinite(table.columns.dec[i]) || Math.abs(table.columns.dec[i]) > 90) throw Error(`Invalid coordinates in catalog row ${i + 1}`)
    if (Number.isFinite(table.columns.mpc?.[i]) && table.columns.mpc[i] < 0) throw Error(`Negative distance in catalog row ${i + 1}`)
  }
  return table
}
/** Small transient record for inspectors; renderers use typed columns directly. */
export function rowAt(table, index) {
  if (!table || !Number.isInteger(index) || index < 0 || index >= table.length) return null
  const row = { id: index }
  for (const [key, values] of Object.entries(table.columns)) row[key] = values[index]
  for (const [key, values] of Object.entries(table.strings || {})) row[key] = values[index]
  return row
}
export function readBinaryTable(buffer, header) {
  if (header.schema !== 1 || header.format !== 'cosmic-atlas-columnar-v1' || !Array.isArray(header.columns)) throw Error('Unsupported binary catalog format')
  const columns = {}, view = new DataView(buffer)
  for (const column of header.columns) {
    const { name, dtype, offset, length } = column
    if (!/^[a-z][a-z0-9_]*$/i.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || Object.hasOwn(columns, name) || dtype !== 'float32' || length !== header.length || !Number.isInteger(offset) || offset < 0 || offset + length * 4 > buffer.byteLength) throw Error(`Invalid binary column ${name}`)
    const values = new Float32Array(length)
    for (let i = 0; i < length; i++) values[i] = view.getFloat32(offset + i * 4, true)
    columns[name] = values
  }
  return validateTable({ length: header.length, columns, strings: header.strings || {}, meta: header })
}
export function filterIndices(table, filters = {}) {
  const indices = new Uint32Array(table.length)
  const text = String(filters.text || '').toLocaleLowerCase()
  let count = 0
  for (let i = 0; i < table.length; i++) {
    let keep = true
    for (const [key, filter] of Object.entries(filters)) {
      if (filter === '' || filter === null || filter === undefined || key === 'text') continue
      const range = /^(.*)(Min|Max)$/.exec(key)
      if (range && Number.isFinite(Number(filter))) {
        const value = table.columns[range[1]]?.[i]
        if (!Number.isFinite(value) || (range[2] === 'Min' ? value < Number(filter) : value > Number(filter))) { keep = false; break }
      } else if ((key === 'cls' || key === 'categories') && Array.isArray(filter) && filter.length) {
        if (!filter.includes(table.strings.cls?.[i])) { keep = false; break }
      } else if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
        const value = table.columns[key]?.[i] ?? table.strings[key]?.[i]
        if ((filter.min !== undefined && (!Number.isFinite(value) || value < filter.min)) || (filter.max !== undefined && (!Number.isFinite(value) || value > filter.max)) || (filter.values?.length && !filter.values.includes(value))) { keep = false; break }
      }
    }
    if (keep && text && !Object.values(table.strings || {}).some(values => values[i]?.toLocaleLowerCase().includes(text))) keep = false
    if (keep) indices[count++] = i
  }
  return indices.slice(0, count)
}
