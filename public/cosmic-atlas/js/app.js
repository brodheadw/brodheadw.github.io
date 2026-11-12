import { createStore } from './store.js'
import { readURLState, writeURLState } from './url-state.js'
import { fetchPreset } from './presets.js'
import { WORKSPACES, workspacePreset } from './workspaces/index.js'
import { loadRegistry, rowAt, filterTable } from './data/loaders.js'
import { resolveSatelliteSource } from './data/satellite-source.js'
import { createSatelliteSelectionResolver } from './data/satellite-selection.js'
import { loadLayerPlugin } from './layers/index.js'
import { installPalette, palette } from './palette.js'
import { scaleRuler } from './render/geometry.js'
import { createScene, MPC_KM } from './render/scene.js'
import { bodiesAt, solarOrbit } from './astro/solar.js'
import { createSatelliteClient } from './astro/satellites.js'
import { formatDistance } from './astro/units.js'
import { mountShell } from './shell/index.js'

const $ = id => document.getElementById(id)
installPalette()
function toast(message) { const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; $('toasts').append(node); setTimeout(() => node.remove(), 6000) }
async function loadJSON(path) { const r = await fetch(path); if (!r.ok) throw Error(`${path}: HTTP ${r.status}`); return r.json() }
let initial
try { initial = await readURLState() || await fetchPreset('default') } catch (error) { toast(error.message); initial = workspacePreset('bootes') }
const store = createStore(initial), bus = new EventTarget(), tables = new Map(), status = new Map(), plugins = new Map(), filterKeys = new Map(), masks = new Map(), loading = new Map()
let registry = [], renderer, ready = false, latestBodies = [], satellites = [], satelliteState = null, satelliteStatus = null, metrics = null
let resolveSatelliteSelection = createSatelliteSelectionResolver()
let clockAnchor = performance.now(), clockValue = store.getState().clock, clockEpoch = clockValue.utc ? Date.parse(clockValue.utc) : Date.now()
const client = createSatelliteClient()
const emit = () => bus.dispatchEvent(new Event('change'))
function currentDate() { return new Date(clockEpoch + (clockValue.paused ? 0 : (performance.now() - clockAnchor) * clockValue.rate)) }
function snapshotState() { const s = structuredClone(store.getState()); s.clock.utc = currentDate().toISOString(); return s }
function selectionRow() {
  const selected = store.getState().selection
  if (!selected) return null
  if (selected.layer === 'solar') return latestBodies.find(b => b.id === String(selected.id).toLowerCase()) || null
  if (selected.layer === 'satellites') return satellites[resolveSatelliteSelection(selected)?.index] || null
  return rowAt(tables.get(selected.layer), Number(selected.id))
}
function select(layer, id, { fly = true } = {}) {
  if (layer === 'solar') id = String(id).toLowerCase()
  store.set({ selection: resolveSatelliteSelection({ layer, id }), focusLayer: layer })
  const row = selectionRow()
  if (!row || !renderer || !fly) return
  if (layer === 'solar') {
    const distance = Math.max(row.radiusKm * 6, row.id === 'sun' ? 149597870.7 * 3 : row.radiusKm * 6) / MPC_KM
    renderer.focus(row.position.map(x => x / MPC_KM), distance)
    store.set({ camera: { mode: 'follow' } }, { history: false })
    const points = solarOrbit(row.name, currentDate(), 160)
    renderer.setOrbitPaths(points.length ? [{ positions: points.flat(), color: palette.accent }] : [])
  } else if (layer === 'satellites') {
    const p = satelliteState?.gcrsPositions, earth = latestBodies.find(x => x.id === 'earth')
    if (p && earth && satelliteState.valid[row.index]) { renderer.focus([0, 1, 2].map(k => (earth.position[k] + p[row.index * 3 + k]) / MPC_KM), 15000 / MPC_KM); store.set({ camera: { mode: 'follow' } }, { history: false }) }
  } else if (Number.isFinite(row.mpc)) renderer.focus([Math.cos(row.dec * Math.PI / 180) * Math.cos(row.ra * Math.PI / 180), Math.cos(row.dec * Math.PI / 180) * Math.sin(row.ra * Math.PI / 180), Math.sin(row.dec * Math.PI / 180)].map(x => x * row.mpc), Math.max(.00002, row.mpc * .18))
  else renderer.lookAtDirection(row.ra, row.dec)
}
function workspace(id) {
  const next = workspacePreset(id)
  // User experiments and saved panel positions travel with the user between workspaces.
  next.experiments = store.getState().experiments; next.panels = store.getState().panels; next.observer = store.getState().observer; next.clock = snapshotState().clock
  if (id === 'earth') { const earth = latestBodies.find(x => x.id === 'earth'); if (earth) next.camera.target = earth.position.map(x => x / MPC_KM); next.camera.mode = 'follow' }
  store.replace(next); emit()
  if (id === 'solar' && renderer) {
    const paths = latestBodies.filter(b => !['sun','moon','io','europa','ganymede','callisto'].includes(b.id)).map(b => ({ positions: solarOrbit(b.name, currentDate(), 128).flat(), color: palette.grid }))
    renderer.setOrbitPaths(paths)
  } else renderer?.setOrbitPaths([])
}
async function applyFilters(id) {
  const table = tables.get(id); if (!table) return
  const filters = store.getState().layers[id]?.filters || {}, key = JSON.stringify(filters)
  if (filterKeys.get(id) === key) return
  filterKeys.set(id, key)
  try { const indices = await filterTable(table, filters); if (filterKeys.get(id) !== key) return; masks.set(id, indices); renderer?.setIndices(id, indices); emit() } catch (error) { status.set(id, { error: error.message }); emit() }
}
async function loadLayer(id, reload = false) {
  if (loading.has(id)) return loading.get(id)
  if (!reload && status.get(id)?.ready) return
  const layer = registry.find(x => x.id === id); if (!layer) return
  const promise = (async () => {
    status.set(id, { loading: true }); emit()
    try {
      const plugin = await loadLayerPlugin(layer); plugins.set(id, plugin)
      const table = await plugin.load(app, layer, { reload })
      if (table?.columns) { tables.set(id, table); filterKeys.delete(id) }
      if (renderer) await plugin.render?.(app, table, layer)
      status.set(id, { ready: true, rows: table?.length || table?.objects?.length, format: table?.meta?.loadedFormat }); await applyFilters(id)
    } catch (error) { status.set(id, { error: error.message }); if (layer.kind === 'satellites') satelliteStatus = error.message }
    finally { loading.delete(id); emit() }
  })()
  loading.set(id, promise); return promise
}
async function loadSatellites() {
  try {
    const { url: source } = await resolveSatelliteSource()
    const result = await client.load(source)
    satellites = result.objects; resolveSatelliteSelection = createSatelliteSelectionResolver(satellites)
    // Old position buffers use the previous snapshot's indices.
    satelliteState = null; renderer?.setSatellites(null)
    syncSatelliteSelection(); client.update(currentDate(), store.getState().observer)
    satelliteStatus = `Public snapshot: ${satellites.length.toLocaleString()} objects`; $('countMetric').textContent = ([...tables.values()].reduce((n, table) => n + table.length, 0) + satellites.length).toLocaleString(); return result
  } catch (error) {
    try { satelliteStatus = satelliteStatus || error.message } catch { satelliteStatus = 'No satellite snapshot has been published. The atlas never downloads the full catalog from CelesTrak in your browser.' }
    throw Error(satelliteStatus)
  }
}
function syncSatelliteSelection(next = store.getState()) {
  const selection = resolveSatelliteSelection(next.selection), missing = selection?.layer === 'satellites' && selection.index === -1
  if (selection === next.selection && !(missing && next.camera.mode === 'follow')) return false
  store.set({ selection, ...(missing || (!selection && next.selection?.layer === 'satellites') ? { camera: { mode: 'orbit' } } : {}) }, { history: false })
  if (missing) { renderer?.setOrbitPaths([]); toast(`Selected NORAD ${selection.id.slice(4)} is absent from this snapshot. Following stopped.`) }
  return true
}
async function syncCatalogs() {
  registry = await loadRegistry({ reload: true })
  await Promise.allSettled(registry.filter(l => tables.has(l.id) || store.getState().layers[l.id]?.visible).map(l => loadLayer(l.id, true)))
  $('countMetric').textContent = ([...tables.values()].reduce((n, table) => n + table.length, 0) + satellites.length).toLocaleString()
  emit()
}
const app = { store, tables, status, masks, plugins, toast, loadJSON, currentDate, snapshotState, selectionRow, select, workspace, loadLayer, loadSatellites, syncCatalogs, client,
  subscribe(fn) { bus.addEventListener('change', fn); return () => bus.removeEventListener('change', fn) },
  get registry() { return registry }, get renderer() { return renderer }, get ready() { return ready }, get metrics() { return metrics }, get bodies() { return latestBodies },
  get satellites() { return satellites }, get satelliteState() { return satelliteState }, get satelliteStatus() { return satelliteStatus },
  selectedDetails() { const s = store.getState().selection, row = s?.layer === 'satellites' ? selectionRow() : null; return row ? client.request('details', { id: row.id, date: currentDate().toISOString(), observer: store.getState().observer }) : Promise.resolve(null) },
}
window.__atlas = app
try {
  renderer = createScene({ container: $('scene'), store, onSelect: select, onHover(p, event) {
    const tip = $('hoverTip'), table = tables.get(p?.layer), row = p?.layer === 'solar' ? latestBodies.find(b => b.id === p.id) : p?.layer === 'satellites' ? satellites[Number(p.id)] : rowAt(table, p?.id)
    tip.hidden = !row; if (!row) return
    tip.textContent = row.name; const bounds = $('scene').getBoundingClientRect(); tip.style.left = `${Math.min(bounds.width - 240, event.clientX - bounds.left + 12)}px`; tip.style.top = `${event.clientY - bounds.top + 12}px`
  }, onMetrics(value) { metrics = value; $('perfReadout').textContent = `${value.fps.toFixed(0)} fps / ${value.frameMs.toFixed(1)} ms`; const state = store.getState(), ruler = scaleRuler(value.distance, $('scene').clientHeight, innerWidth < 760 ? 75 : 115)
    $('scaleReadout').textContent = state.view === 'sky' ? 'ALL SKY' : formatDistance(value.distance)
    const line = document.querySelector('.scale-line'); line.style.width = `${ruler.pixels}px`; line.hidden = state.view === 'sky' || state.camera.log
    $('scaleDetail').textContent = state.view === 'sky' ? 'ICRS · RA increases left' : state.camera.log ? 'Log radius · nonuniform scale' : `${formatDistance(ruler.mpc)} / ${(ruler.mpc * 3.261563777e6).toLocaleString(undefined, { maximumSignificantDigits: 3 })} ly` } })
} catch (error) { $('sceneError').hidden = false; $('sceneError').textContent = `The 3D viewport could not start: ${error.message}. The catalogs and experiments remain available in the sidebar.` }
mountShell(app)
let previousWorkspace = store.getState().workspace, urlTimer
store.subscribe(next => {
  if (syncSatelliteSelection(next)) return
  if (next.clock !== clockValue && JSON.stringify(next.clock) !== JSON.stringify(clockValue)) { clockValue = next.clock; clockEpoch = clockValue.utc ? Date.parse(clockValue.utc) : Date.now(); clockAnchor = performance.now() }
  for (const [id, state] of Object.entries(next.layers)) { if (state.visible && !status.get(id)?.ready && !status.get(id)?.error) loadLayer(id); if (tables.has(id)) applyFilters(id) }
  if (next.workspace !== previousWorkspace) { previousWorkspace = next.workspace; emit() }
  clearTimeout(urlTimer); urlTimer = setTimeout(() => { writeURLState(snapshotState()).catch(() => {}) }, 900)
  emit()
})
addEventListener('hashchange', async () => { try { const s = await readURLState(); if (s) store.replace(s) } catch (error) { toast(error.message) } })
client.subscribe(payload => { if (payload.type !== 'positions') return; satelliteState = payload; renderer?.setSatellites(payload, satellites); emit() })
function tick() {
  const date = currentDate()
  try {
    latestBodies = bodiesAt(date).map(body => ({ ...body, utc: date.toISOString() })); renderer?.setSolarBodies(latestBodies)
    const state = store.getState(), selected = state.selection
    if (state.camera.mode === 'follow' && selected) {
      let target
      if (selected.layer === 'solar') target = latestBodies.find(x => x.id === selected.id)?.position.map(x => x / MPC_KM)
      if (selected.layer === 'satellites' && satelliteState?.valid[selected.index]) { const earth = latestBodies.find(x => x.id === 'earth'); target = [0, 1, 2].map(k => (earth.position[k] + satelliteState.gcrsPositions[selected.index * 3 + k]) / MPC_KM) }
      if (target) store.set({ camera: { target } }, { history: false })
    }
    if (satellites.length && state.layers.satellites?.visible) client.update(date, state.observer)
    $('utcReadout').textContent = date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    $('clockMode').textContent = state.clock.paused ? 'PAUSED' : `${state.clock.rate}× UTC`
    $('frameMetric').textContent = state.camera.distance < 1e-13 ? 'GEOCENTRIC / GCRS' : state.camera.distance < 1e-8 ? 'HELIOCENTRIC / EQJ' : 'ICRS / J2000'
    emit()
  } catch (error) { toast(error.message) }
}
tick(); setInterval(tick, 1000)
setInterval(() => { if (store.getState().syncAuto !== false) syncCatalogs().catch(error => toast(error.message)) }, 15 * 60 * 1000)
try {
  registry = await loadRegistry()
  const patch = {}
  for (const layer of registry) if (!store.getState().layers[layer.id]) patch[layer.id] = { visible: false, opacity: layer.kind === 'skymap' ? .6 : 1, filters: {} }
  store.set({ layers: patch }, { history: false })
  await Promise.allSettled(registry.filter(layer => (['catalog', 'points3d', 'directions'].includes(layer.module || layer.kind) && (layer.files.binary || layer.files.csv || layer.files.json)) || store.getState().layers[layer.id]?.visible).map(layer => loadLayer(layer.id)))
  ready = true; $('pipelineMetric').textContent = [...status.values()].some(s => s.error) ? 'READY / CHECK DATA' : 'READY'
  $('countMetric').textContent = [...tables.values()].reduce((n, table) => n + table.length, 0).toLocaleString()
  $('loadingStatus').textContent = `${registry.length} layers`; emit()
} catch (error) { $('pipelineMetric').textContent = 'DATA UNAVAILABLE'; $('loadingStatus').textContent = error.message; toast(error.message) }
