import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore, normalizeState, migrateState, DEFAULT_STATE } from '../../js/store.js'
import { encodeState, decodeState } from '../../js/url-state.js'
import { exportPreset, importPreset, savePreset, listPresets, renamePreset, deletePreset } from '../../js/presets.js'
import { WORKSPACES, workspacePreset } from '../../js/workspaces/index.js'

test('nested patches preserve fields, immutable snapshots, undo and redo', () => {
  const store = createStore()
  let notifications = 0
  const unsubscribe = store.subscribe(() => notifications++)
  store.set({ camera: { distance: 0.5 }, layers: { galaxies: { opacity: 0.2 } } })
  assert.equal(store.getState().camera.distance, 0.5)
  assert.equal(store.getState().camera.yaw, DEFAULT_STATE.camera.yaw)
  assert.equal(store.getState().layers.galaxies.visible, true)
  assert.throws(() => { store.getState().camera.distance = 1 })
  assert.equal(store.undo(), true)
  assert.equal(store.getState().camera.distance, 0.12)
  assert.equal(store.redo(), true)
  assert.equal(store.getState().camera.distance, 0.5)
  assert.equal(notifications, 3)
  unsubscribe()
})

test('old presets migrate, invalid future state and unsafe values are rejected', () => {
  assert.equal(migrateState({ schema: 0, workspace: 'darkmatter', camera: { radius: 2 } }).camera.distance, 2)
  assert.equal(normalizeState({ workspace: 'satellites' }).workspace, 'earth')
  for (const state of [{ schema: 7 }, { camera: { distance: -1 } }, { observer: { lat: 91 } }, { layers: { neutrinos: { opacity: 2 } } }, { panels: { bootes: { order: 2 } } }, { panels: { bootes: { open: { inspector: 'yes' } } } }, { references: { equatorial: 'false' } }, { experiments: [null] }, { camera: { target: [1, NaN, 0] } }, JSON.parse('{"__proto__":{"polluted":true}}')]) assert.throws(() => normalizeState(state))
  assert.equal({}.polluted, undefined)
})

test('every workspace produces validated state with the default Boötes focus', () => {
  for (const workspace of WORKSPACES) assert.equal(normalizeState(workspacePreset(workspace.id)).workspace, workspace.id)
  const state = workspacePreset('bootes')
  assert.deepEqual(state.selection, { layer: 'curated', id: 1 })
  assert.equal(state.layers.galaxies.filters.mpcMax, 3)
  assert.equal(workspacePreset('explore').layers.galaxies.filters.mpcMax, undefined)
})

test('shared links round-trip Unicode, filters, view and experiment state', async () => {
  const state = normalizeState({ ascii: true, experiments: [{ name: 'Boötes III ≠ detection', inputs: { radius: 1.5 } }], camera: { distance: 1e-15 }, layers: { neutrinos: { filters: { energyMin: 250000 } } } })
  const encoded = await encodeState(state)
  assert.deepEqual(await decodeState(`#state=${encoded}`), state)
  await assert.rejects(decodeState('v2.abc'))
  await assert.rejects(decodeState('v1j.%%%'))
})

test('preset import/export validates and storage failure remains usable', async () => {
  const state = normalizeState({ ascii: true })
  const exported = exportPreset(state, 'Boötes')
  assert.deepEqual((await importPreset(exported)).state, state)
  await assert.rejects(importPreset('{"schema":100}'))
  const broken = { getItem() { throw Error('disabled') }, setItem() { throw Error('disabled') } }
  assert.deepEqual(listPresets(broken), [])
  assert.equal(savePreset('offline', state, { storage: broken }).ok, false)
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const saved = savePreset('first', state, { id: 'sample', storage })
  assert.equal(saved.ok, true)
  assert.equal(renamePreset('sample', 'renamed', storage).ok, true)
  assert.equal(listPresets(storage)[0].name, 'renamed')
  deletePreset('sample', storage)
  assert.equal(listPresets(storage).length, 0)
})


test('URL sharing falls back to plain JSON when compression is unavailable', async () => {
  const original = globalThis.CompressionStream
  try {
    globalThis.CompressionStream = undefined
    const state = normalizeState({ ascii: true })
    const encoded = await encodeState(state)
    assert.ok(encoded.startsWith('v1j.'))
    assert.deepEqual(await decodeState(encoded), state)
  } finally { globalThis.CompressionStream = original }
})
