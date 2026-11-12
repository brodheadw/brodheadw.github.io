import { parseCSVTable, jsonToTable, readBinaryTable, filterIndices } from './schema.js'
export { rowAt } from './schema.js'
let registryPromise, worker, serial = 0
const pending = new Map(), tables = new Map()
function run(operation, payload) {
  if (typeof Worker === 'undefined') {
    try { return Promise.resolve(operation === 'csv' ? parseCSVTable(payload.text, payload.meta) : operation === 'json' ? jsonToTable(payload.rows, payload.meta) : operation === 'binary' ? readBinaryTable(payload.buffer, payload.header) : filterIndices(payload.table, payload.filters)) } catch (error) { return Promise.reject(error) }
  }
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => { const request = pending.get(data.id); if (!request) return; pending.delete(data.id); data.error ? request.reject(Error(data.error)) : request.resolve(data.result) }
    worker.onerror = event => { for (const request of pending.values()) request.reject(Error(event.message || 'Catalog worker failed')); pending.clear(); worker?.terminate(); worker = null }
  }
  return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); worker.postMessage({ id, operation, payload }) })
}
async function response(url, type = 'json') {
  if (typeof url !== 'string' || !/^(?:data\/|https:\/\/)/.test(url)) throw Error('Invalid dataset URL')
  const result = await fetch(url)
  if (!result.ok) throw Error(`${url}: HTTP ${result.status}`)
  return result[type]()
}
export function loadRegistry({ reload = false } = {}) {
  if (reload) registryPromise = null
  return registryPromise ||= response('data/layers.json').then(raw => {
    const layers = Array.isArray(raw) ? raw : raw.layers
    if (!Array.isArray(layers)) throw Error('Layer registry is missing layers')
    const seen = new Set()
    return layers.map(layer => {
      if (typeof layer.id !== 'string' || !/^[a-z0-9._-]+$/i.test(layer.id) || seen.has(layer.id) || !['points3d', 'directions', 'skymap', 'volume', 'annotations', 'solar', 'satellites'].includes(layer.kind)) throw Error(`Invalid layer registry entry: ${layer.id}`)
      seen.add(layer.id)
      return { category: 'Catalogs', filters: [], panels: [], ...layer, title: layer.title || layer.id, files: layer.files || {}, updated_at: layer.updated_at || raw.updated_at, registryVersion: raw.schema || 1 }
    })
  }).catch(error => { registryPromise = null; throw error })
}
async function verifyHash(buffer, expected) {
  if (!expected || !globalThis.crypto?.subtle) return
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  const actual = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  if (actual !== expected.toLowerCase()) throw Error('Binary catalog checksum does not match its header')
}
export async function loadTable(layer, { reload = false } = {}) {
  if (typeof layer === 'string') layer = (await loadRegistry()).find(item => item.id === layer)
  if (!layer) throw Error('Dataset was not found in the layer registry')
  if (reload) tables.delete(layer.id)
  if (tables.has(layer.id)) return tables.get(layer.id)
  const promise = (async () => {
    const meta = { ...layer, dataVersion: layer.version || layer.updated_at }
    const files = layer.files || {}
    let binaryError
    if (files.binary && files.header) {
      try {
        const [header, buffer] = await Promise.all([response(files.header), response(files.binary, 'arrayBuffer')])
        await verifyHash(buffer, header.sha256)
        const table = await run('binary', { buffer, header })
        table.meta = { ...meta, ...table.meta, loadedFormat: 'binary' }
        return table
      } catch (error) { binaryError = error }
    }
    if (files.csv) {
      const table = await run('csv', { text: await response(files.csv, 'text'), meta: { ...meta, loadedFormat: 'csv', binaryWarning: binaryError?.message } })
      return table
    }
    if (files.json) return run('json', { rows: await response(files.json), meta: { ...meta, loadedFormat: 'json' } })
    throw binaryError || Error(`${layer.title}: no point catalog is available`)
  })().catch(error => { tables.delete(layer.id); throw error })
  tables.set(layer.id, promise)
  return promise
}
export const filterTable = (table, filters = {}) => run('filter', { table, filters })
export function disposeDataWorkers() { worker?.terminate(); worker = null; for (const request of pending.values()) request.reject(Error('Catalog worker closed')); pending.clear() }
