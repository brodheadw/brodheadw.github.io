import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { rankTargetRows } from '../../js/panels/target-ranking.js'
import { runExperimentCore } from '../../js/experiments/core.js'

test('ranking pins Boötes III, sorts observed counts and leaves inputs unchanged', () => {
  const rows = [{ name: 'Zulu', observed: 20, expected: 10 }, { name: 'Boötes III', observed: 0, expected: .5 }, { name: 'Alpha', observed: 20, expected: 5 }]
  const before = structuredClone(rows), ranked = rankTargetRows(rows)
  assert.deepEqual(ranked.map(row => row.name), ['Boötes III', 'Alpha', 'Zulu'])
  assert.deepEqual(rows, before)
  assert.equal(ranked[0].residual, -.5 / Math.sqrt(.5))
  assert.throws(() => rankTargetRows([{ name: 'Missing background', observed: 1 }]), /chance expectation/)
})

test('published ranking preserves 119 counts, backgrounds and stored residuals', async () => {
  const doc = JSON.parse(await readFile(new URL('../../data/targets.json', import.meta.url)))
  const ranked = rankTargetRows(doc.targets.map(row => ({ ...row, observed: row.tracks, residual: row.sigma })))
  assert.equal(ranked.length, 119)
  assert.equal(ranked[0].name, 'Boötes III')
  assert.equal(ranked[0].expected, doc.targets.find(row => row.name === 'Boötes III').expected)
  assert.equal(ranked[0].residual, doc.targets.find(row => row.name === 'Boötes III').sigma)
  assert.ok(ranked.slice(1).every((row, i, all) => !i || all[i - 1].observed >= row.observed))
})

test('direction ranking uses analytic uniform-RA backgrounds without p-value claims', () => {
  const result = runExperimentCore({ targets: [{ id: 1, name: 'Target', ra: 0, dec: 0 }], events: [{ ra: 0, dec: 0 }, { ra: 180, dec: 0 }], radius: 10, scrambles: 0 })
  const ranked = rankTargetRows(result.results.map(row => ({ ...row, expected: row.expectedRA })))
  assert.equal(ranked[0].observed, 1)
  assert.ok(Math.abs(ranked[0].expected - 1 / 9) < 1e-12)
  assert.equal(result.pValue, null)
  assert.ok(Math.abs(ranked[0].residual - (1 - 1 / 9) / Math.sqrt(1 / 9)) < 1e-12)
})
