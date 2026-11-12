const WORKSPACE_IDS = ['explore', 'neutrinos', 'dark-matter', 'gamma', 'bootes', 'solar', 'earth', 'custom']
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const clone = value => structuredClone(value)
const radians = Math.PI / 180
const bootes = [0.046 * Math.cos(26.8 * radians) * Math.cos(209.3 * radians), 0.046 * Math.cos(26.8 * radians) * Math.sin(209.3 * radians), 0.046 * Math.sin(26.8 * radians)]
export const DEFAULT_STATE = {
  schema: 1, workspace: 'bootes', view: '3d', ascii: false, guides: false, bodyScale: 'visible',
  camera: { target: bootes, distance: 0.12, yaw: 0.56, pitch: 0.26, mode: 'orbit', log: false },
  layers: {
    curated: { visible: true, opacity: 1, filters: { mpcMax: 3 } },
    galaxies: { visible: true, opacity: 0.8, filters: { mpcMax: 3 } },
    neutrinos: { visible: true, opacity: 0.85, filters: {} },
    fermi: { visible: false, opacity: 0.8, filters: {} },
    'sky.icecube': { visible: true, opacity: 0.5, filters: {} },
  },
  selection: { layer: 'curated', id: 1 }, focusLayer: null,
  clock: { utc: null, rate: 1, paused: false }, observer: { lat: 40, lon: -74, height: 0 },
  experiments: [], panels: {},
}
function assert(condition, message) { if (!condition) throw new Error(`Invalid preset: ${message}`) }
function safeJSON(value, path = 'state', depth = 0) {
  assert(depth <= 32, `${path} is nested too deeply`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') { assert(Number.isFinite(value), `${path} must be finite`); return }
  assert(Array.isArray(value) || plain(value), `${path} must contain JSON values`)
  for (const [key, child] of Object.entries(value)) {
    assert(!forbidden.has(key), `${path} contains an unsafe key`)
    safeJSON(child, `${path}.${key}`, depth + 1)
  }
}
/** Nested objects merge; arrays and scalar values replace. Inputs are never mutated. */
export function mergeState(base, patch) {
  safeJSON(patch)
  if (!plain(patch)) return clone(patch)
  const next = plain(base) ? clone(base) : {}
  for (const [key, value] of Object.entries(patch)) next[key] = plain(value) ? mergeState(next[key], value) : clone(value)
  return next
}
/** Version 0 used a workspace alias and camera.radius; reject future schemas. */
export function migrateState(input) {
  safeJSON(input)
  assert(plain(input), 'state must be an object')
  const state = clone(input)
  const version = state.schema ?? 0
  assert(version === 0 || version === 1, `unsupported schema ${version}`)
  if (version === 0) {
    if (state.workspace === 'darkmatter') state.workspace = 'dark-matter'
    if (state.workspace === 'satellites') state.workspace = 'earth'
    if (state.camera && state.camera.radius !== undefined) {
      state.camera.distance ??= state.camera.radius
      delete state.camera.radius
    }
    state.schema = 1
  }
  return state
}
export function normalizeState(input = {}) {
  const migrated = migrateState(input)
  const state = mergeState(DEFAULT_STATE, migrated)
  // Explicit filter sets in a loaded preset replace the default workspace's filters.
  for (const [id, layer] of Object.entries(migrated.layers || {})) if (Object.hasOwn(layer, 'filters')) state.layers[id].filters = clone(layer.filters)
  validateState(state)
  return state
}
export function validateState(state) {
  safeJSON(state)
  assert(plain(state) && state.schema === 1, 'schema must be 1')
  assert(WORKSPACE_IDS.includes(state.workspace), 'unknown workspace')
  assert(['3d', 'sky'].includes(state.view), 'view must be 3d or sky')
  assert(typeof state.ascii === 'boolean', 'ascii must be boolean')
  assert(typeof state.guides === 'boolean' && ['visible', 'true'].includes(state.bodyScale), 'invalid reference guides or body scale')
  const camera = state.camera
  assert(plain(camera), 'camera must be an object')
  assert(Array.isArray(camera.target) && camera.target.length === 3 && camera.target.every(Number.isFinite), 'camera target must be three finite Mpc values')
  assert(Number.isFinite(camera.distance) && camera.distance >= 1e-18 && camera.distance <= 1e6, 'camera distance is outside supported Mpc range')
  assert(Number.isFinite(camera.yaw) && Number.isFinite(camera.pitch) && Math.abs(camera.pitch) <= Math.PI / 2, 'invalid camera orientation')
  assert(['orbit', 'fly', 'follow'].includes(camera.mode) && typeof camera.log === 'boolean', 'invalid camera mode')
  assert(plain(state.layers), 'layers must be an object')
  assert(Object.keys(state.layers).length <= 500, 'too many layers')
  for (const [id, layer] of Object.entries(state.layers)) {
    assert(/^[a-zA-Z0-9._-]{1,100}$/.test(id) && plain(layer), 'invalid layer ID')
    assert(typeof layer.visible === 'boolean' && Number.isFinite(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1 && plain(layer.filters), `invalid layer ${id}`)
  }
  assert(state.selection === null || (plain(state.selection) && typeof state.selection.layer === 'string' && (typeof state.selection.id === 'string' || Number.isInteger(state.selection.id))), 'invalid selection')
  assert(state.focusLayer === null || typeof state.focusLayer === 'string', 'invalid focused layer')
  assert(plain(state.clock) && (state.clock.utc === null || (typeof state.clock.utc === 'string' && Number.isFinite(Date.parse(state.clock.utc)))), 'invalid UTC clock')
  assert(Number.isFinite(state.clock.rate) && Math.abs(state.clock.rate) <= 1e6 && typeof state.clock.paused === 'boolean', 'invalid clock rate')
  assert(plain(state.observer) && Number.isFinite(state.observer.lat) && Math.abs(state.observer.lat) <= 90 && Number.isFinite(state.observer.lon) && Math.abs(state.observer.lon) <= 180 && Number.isFinite(state.observer.height) && state.observer.height >= -1 && state.observer.height <= 1e6, 'invalid observer location (height is km)')
  assert(Array.isArray(state.experiments) && state.experiments.length <= 200, 'experiments must be a list with at most 200 results')
  assert(plain(state.panels), 'panels must be an object')
  for (const [workspace, preferences] of Object.entries(state.panels)) {
    assert(WORKSPACE_IDS.includes(workspace) && plain(preferences), 'invalid workspace panel preferences')
    if (preferences.order !== undefined) assert(Array.isArray(preferences.order) && preferences.order.length <= 100 && preferences.order.every(id => typeof id === 'string' && /^[a-z0-9._:-]+$/i.test(id)), 'panel order must be a list of panel IDs')
    if (preferences.open !== undefined) assert(plain(preferences.open) && Object.values(preferences.open).every(value => typeof value === 'boolean'), 'panel open states must be boolean')
  }
  if (state.references !== undefined) assert(plain(state.references) && Object.values(state.references).every(value => typeof value === 'boolean'), 'reference toggles must be boolean')
  assert(state.experiments.every(plain), 'experiment records must be objects')
  return state
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
/** One immutable state snapshot; nonhistorical animation updates avoid filling undo. */
export function createStore(initial = {}) {
  let state = freeze(normalizeState(initial))
  const past = [], future = [], listeners = new Set()
  const emit = () => { for (const listener of listeners) listener(state) }
  function replace(next, { history = true } = {}) {
    const checked = freeze(normalizeState(next))
    if (JSON.stringify(checked) === JSON.stringify(state)) return state
    if (history) { past.push(state); if (past.length > 100) past.shift(); future.length = 0 }
    state = checked
    emit()
    return state
  }
  return {
    getState: () => state,
    set: (patch, options) => replace(mergeState(state, patch), options),
    replace,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    undo: () => { if (!past.length) return false; future.push(state); state = past.pop(); emit(); return true },
    redo: () => { if (!future.length) return false; past.push(state); state = future.pop(); emit(); return true },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}
