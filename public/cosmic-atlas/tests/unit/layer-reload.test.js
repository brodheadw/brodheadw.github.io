import test from 'node:test'
import assert from 'node:assert/strict'
import { loadLayerPlugin } from '../../js/layers/index.js'

test('catalog and direction plugins forward reload so refreshed rows replace their cache', async t => {
  let revision = 1, requests = 0
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => { requests++; return `name,ra,dec\nrevision-${revision},1,2` } }))
  for (const module of ['catalog', 'directions']) {
    const layer = { id: `reload-${module}`, kind: module === 'catalog' ? 'points3d' : 'directions', module, files: { csv: 'data/test.csv' } }
    const plugin = await loadLayerPlugin(layer)
    revision = 1
    const first = await plugin.load({}, layer)
    revision = 2
    assert.equal((await plugin.load({}, layer)).strings.name[0], 'revision-1')
    const refreshed = await plugin.load({}, layer, { reload: true })
    assert.equal(first.strings.name[0], 'revision-1')
    assert.equal(refreshed.strings.name[0], 'revision-2')
  }
  assert.equal(requests, 4)
})

test('satellite JSON reload dispatches through its own loader even with points3d registry kind', async () => {
  const layer = { id: 'satellites', kind: 'points3d', module: 'satellites', files: { json: 'data/satellites/gp.json' } }
  const plugin = await loadLayerPlugin(layer), snapshot = { objects: [{ id: 'sat:25544' }] }
  let calls = 0
  const result = await plugin.load({ loadSatellites: async () => { calls++; return snapshot } }, layer, { reload: true })
  assert.equal(result, snapshot)
  assert.equal(calls, 1)
})
