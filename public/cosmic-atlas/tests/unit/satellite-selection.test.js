import test from 'node:test'
import assert from 'node:assert/strict'
import { createSatelliteSelectionResolver } from '../../js/data/satellite-selection.js'
import { createStore } from '../../js/store.js'
import { exportPreset, importPreset } from '../../js/presets.js'

const iss = { id: 'sat:25544', norad: 25544 }, other = { id: 'sat:43210', norad: 43210 }

test('satellite identity follows NORAD across snapshot reorder, removal and reappearance', () => {
  const original = { layer: 'satellites', id: 'sat:25544', index: 0 }
  const reordered = createSatelliteSelectionResolver([other, iss])(original)
  assert.deepEqual(reordered, { ...original, index: 1 })
  const missing = createSatelliteSelectionResolver([other])(reordered)
  assert.deepEqual(missing, { ...original, index: -1 })
  assert.deepEqual(createSatelliteSelectionResolver([iss, other])(missing), original)
  assert.equal(original.index, 0)
  assert.equal(createSatelliteSelectionResolver([iss])(original), original)
})

test('legacy row selections migrate only after a snapshot exists; invalid rows do not select a satellite', () => {
  const legacy = { layer: 'satellites', id: 1 }
  assert.equal(createSatelliteSelectionResolver()(legacy), legacy)
  const resolve = createSatelliteSelectionResolver([other, iss])
  assert.deepEqual(resolve(legacy), { layer: 'satellites', id: 'sat:25544', index: 1 })
  assert.deepEqual(resolve({ ...legacy, id: '1' }), { layer: 'satellites', id: 'sat:25544', index: 1 })
  for (const id of [-1, 2, 1.5, 'bad']) assert.equal(resolve({ ...legacy, id }), null)
  const solar = { layer: 'solar', id: 'earth' }
  assert.equal(resolve(solar), solar)
})

test('saved setups preserve stable satellite identity and rederive their stale index', async () => {
  const saved = createStore({ selection: { layer: 'satellites', id: 'sat:25544', index: 0 } })
  const imported = await importPreset(exportPreset(saved.getState()))
  const restored = createStore(imported.state)
  restored.set({ selection: createSatelliteSelectionResolver([other, iss])(restored.getState().selection) }, { history: false })
  assert.deepEqual(restored.getState().selection, { layer: 'satellites', id: 'sat:25544', index: 1 })
})
