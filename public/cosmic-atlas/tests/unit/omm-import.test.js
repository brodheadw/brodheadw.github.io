import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { importedSnapshot } from '../../js/data/omm-import.js'
import { SatelliteCatalog } from '../../js/astro/satellites.js'
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/skyfield-passes.json', import.meta.url)))

test('OMM import accepts single/list/enveloped records without claiming current complete coverage', () => {
  for (const raw of [fixture.omm, [fixture.omm], { objects: [fixture.omm], source: 'A claimed source', fetched_at: '2019-12-09T16:38:29Z' }]) {
    const snapshot = importedSnapshot(raw, { name: 'historical.json', sha256: 'abc', importedAt: '2026-11-12T00:00:00Z' })
    const catalog = new SatelliteCatalog(snapshot)
    assert.equal(catalog.objects[0].norad, 25544)
    assert.match(snapshot.coverage, /not verified/)
    assert.equal(snapshot.imported.sha256, 'abc')
    assert.match(snapshot.source, /Browser-local/)
  }
})

test('invalid OMM import fails before replacing a usable catalog', () => {
  for (const raw of [null, {}, [], { objects: [] }, { objects: new Array(150001).fill(fixture.omm) }]) assert.throws(() => importedSnapshot(raw))
  assert.throws(() => new SatelliteCatalog(importedSnapshot([{ ...fixture.omm, MEAN_MOTION: -1 }])))
  assert.throws(() => new SatelliteCatalog(importedSnapshot([fixture.omm, fixture.omm])), /Duplicate/)
})
