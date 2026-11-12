import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { satelliteSourceKey, satelliteSourceMatches } from '../../js/data/satellite-source-state.js'

test('a saved local source must match the loaded file hash; names cannot substitute for identity', () => {
  const snapshot = { imported: { filename: 'same.json', sha256: 'a'.repeat(64) } }
  assert.ok(satelliteSourceMatches({ kind: 'local', sha256: 'a'.repeat(64) }, snapshot))
  assert.equal(satelliteSourceMatches({ kind: 'local', name: 'same.json', sha256: 'b'.repeat(64) }, snapshot), false)
  assert.equal(satelliteSourceMatches({ kind: 'local', name: 'same.json' }, snapshot), false)
  assert.equal(satelliteSourceMatches({ kind: 'published' }, snapshot), false)
  assert.ok(satelliteSourceMatches(undefined, { source: 'Published' }))
  assert.notEqual(satelliteSourceKey({ kind: 'local', sha256: 'a' }), satelliteSourceKey({ kind: 'local', sha256: 'b' }))
})

test('worker validates replacements before commit, rejects stale loads and retains its usable catalog', async t => {
  const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/skyfield-passes.json', import.meta.url)))
  const messages = [], originalSelf = globalThis.self
  globalThis.self = { location: { href: 'https://atlas.test/js/data/satellite-worker.js' }, postMessage: data => messages.push(data) }
  t.after(() => { if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf })
  await import(`../../js/data/satellite-worker.js?source-test=${Date.now()}`)
  let id = 0
  const send = async (method, args = {}) => { const requestId = ++id; await self.onmessage({ data: { method, args, requestId } }); return messages.find(row => row.requestId === requestId) }
  const first = await send('import', { text: JSON.stringify(fixture.omm), name: 'first.json', sha256: 'a'.repeat(64) })
  assert.equal(first.result.objects[0].norad, 25544)
  assert.equal((await send('statistics')).result.total, 1, 'legacy import remains immediately usable')
  let release
  const gate = new Promise(resolve => { release = resolve })
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).endsWith('gp.json')) { await gate; return { ok: true, url: 'https://atlas.test/data/satellites/gp.json', json: async () => ({ objects: [fixture.omm] }) } }
    return { ok: true, json: async () => ({ objects: [] }) }
  })
  const stale = send('load', { url: 'data/satellites/gp.json', prepareOnly: true })
  const replacement = await send('import', { text: JSON.stringify({ ...fixture.omm, NORAD_CAT_ID: 43210 }), name: 'replacement.json', sha256: 'b'.repeat(64), prepareOnly: true })
  assert.equal((await send('details', { id: 'sat:25544', date: fixture.cases[0].lookUtc })).result.norad, 25544, 'preparation preserves the prior active source')
  await send('commitSource', { generation: replacement.result.generation })
  release(); assert.match((await stale).error, /Superseded/)
  assert.equal((await send('details', { id: 'sat:43210', date: fixture.cases[0].lookUtc })).result.norad, 43210)
  assert.ok((await send('import', { text: '{bad JSON', prepareOnly: true })).error)
  assert.equal((await send('statistics')).result.total, 1)
  const uncommitted = await send('import', { text: JSON.stringify(fixture.omm), prepareOnly: true })
  await send('cancelSource')
  assert.match((await send('commitSource', { generation: uncommitted.result.generation })).error, /Superseded/)
  assert.equal((await send('details', { id: 'sat:43210', date: fixture.cases[0].lookUtc })).result.norad, 43210)
})
