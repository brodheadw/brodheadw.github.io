import test from 'node:test'
import assert from 'node:assert/strict'
import { runSkyScanCore, excessScore, skyScanCSV } from '../../js/experiments/scan.js'
import { ringProbability } from '../../js/experiments/core.js'
import { runSkyScan, compareRuns } from '../../js/experiments/index.js'

const target = { id: 'target', name: 'Reference target', ra: 0, dec: 0 }
const events = Array.from({ length: 360 }, (_, i) => ({ id: i, ra: i + .5, dec: 0, energy: i % 2 ? 200000 : 10000 }))

test('a uniform-RA null has stable analytic expectations across seeds and nested cuts', () => {
  const input = { targets: [target], events, radii: [5, 10, 20], energyCuts: [0, 100000], scrambles: 99, seed: 12 }
  const scan = runSkyScanCore(input), repeat = runSkyScanCore({ ...input, seed: 19 })
  assert.equal(scan.globalP, 1)
  scan.cells.forEach((cell, i) => assert.ok(Math.abs(cell.expected - [10, 20, 40, 5, 10, 20][i]) < 1e-10))
  assert.deepEqual(scan.cells.map(c => c.observed), [10, 20, 40, 5, 10, 20])
  assert.deepEqual(scan.cells.map(c => c.expected), repeat.cells.map(c => c.expected))
  assert.deepEqual(scan.cells.map(c => c.expected), scan.cells.map(c => c.expectedRA))
  assert.equal(scan.matrix.length, 2)
  assert.equal(scan.cumulative.length, 6)
  assert.ok(scan.sensitivity.every(s => s.canResolve95 && s.requiredCountForLocalP05 > s.background95Count))
  assert.ok(Math.abs(ringProbability(0, 0, 1e-8) - 1e-8 / 180) < 1e-23)
})

test('an equal-area isotropic sphere has the expected cap counts without a spurious excess', () => {
  const sphere = []
  for (let ring = 0; ring < 180; ring++) for (let ra = 0; ra < 360; ra++) sphere.push({ ra: ra + .5, dec: Math.asin(-1 + (ring + .5) / 90) * 180 / Math.PI })
  const scan = runSkyScanCore({ targets: [target], events: sphere, radii: [5, 10], energyCuts: [0], scrambles: 39, seed: 80 })
  for (const cell of scan.cells) {
    const areaExpected = sphere.length * (1 - Math.cos(cell.radius * Math.PI / 180)) / 2
    assert.ok(Math.abs(cell.expectedRA - areaExpected) < areaExpected * .04)
  }
  assert.ok(scan.globalP > .05)
})

test('joint max-statistic probabilities include shared grid trials and finite resolution', () => {
  const clustered = [...events, ...Array.from({ length: 12 }, (_, id) => ({ id: `signal-like-${id}`, ra: .1, dec: 0, energy: 400000 }))]
  const input = { targets: [target], events: clustered, radii: [.5, 2, 10], energyCuts: [0, 300000], scrambles: 199, seed: 7, trials: 3 }
  const scan = runSkyScanCore(input), repeat = runSkyScanCore(input)
  assert.deepEqual(scan.scrambleMaxima, repeat.scrambleMaxima)
  assert.equal(scan.globalP, (1 + scan.scrambleMaxima.filter(score => score >= scan.best.score).length) / 200)
  assert.equal(scan.correctedP, Math.min(1, scan.globalP * 3))
  assert.equal(scan.pResolution, 1 / 200)
  for (const cell of scan.cells) assert.ok(cell.globalP >= cell.localP && cell.globalP >= scan.pResolution && Number.isFinite(cell.score))
  const single = runSkyScanCore({ ...input, radii: [2], energyCuts: [0] })
  assert.equal(single.globalP, single.cells[0].localP)
  assert.ok(Number.isFinite(excessScore(1, 0)))
  assert.match(skyScanCSV(scan), /radius,energyCut,eventCount/)
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(scan)))
})

test('overlapping targets preserve correlation in every shared scramble', () => {
  const input = { targets: [target], events: [...events, { ra: 0, dec: 0, energy: 1 }], radii: [2, 10], scrambles: 99, seed: 42 }
  const single = runSkyScanCore(input), overlap = runSkyScanCore({ ...input, targets: [target, { ...target, id: 'duplicate-cone' }] })
  overlap.cells.forEach((cell, i) => {
    assert.equal(cell.observed, 2 * single.cells[i].observed)
    assert.ok(Math.abs(cell.expectedRA - 2 * single.cells[i].expectedRA) < 1e-10)
    assert.equal(cell.globalP, single.cells[i].globalP)
  })
  overlap.scrambleMaxima.forEach((score, i) => assert.ok(Math.abs(score - 2 * single.scrambleMaxima[i]) < 1e-10))
})

test('masked columnar energies, saved provenance, comparison and cancellation remain explicit', async () => {
  const table = { length: 3, columns: { ra: Float32Array.of(0, 20, 90), dec: Float32Array.of(0, 0, 0), energy: Float32Array.of(200000, NaN, 400000) }, strings: { name: ['one', 'missing energy', 'masked out'] }, indices: Uint32Array.of(0, 1) }
  const input = { targets: [target], events: table, radii: [1, 2], energyCuts: [0, 100000], scrambles: 19, seed: 1, dataVersions: { alerts: 'sha256:published' }, filters: { energyMax: 300000 } }
  const scan = await runSkyScan(input)
  assert.deepEqual(scan.cells.map(c => c.eventCount), [2, 2, 1, 1])
  assert.deepEqual(scan.inputs.eventIds, [0, 1])
  assert.equal(scan.inputs.dataVersions.alerts, 'sha256:published')
  const changed = runSkyScanCore({ ...input, events: { ...table, indices: Uint32Array.of(0) } })
  assert.notEqual(scan.inputs.maskVersions.eventRows, changed.inputs.maskVersions.eventRows)
  const comparison = compareRuns([scan, changed])
  assert.equal(comparison.comparable, false)
  assert.ok(comparison.differences.includes('maskVersions'))
  assert.match(comparison.warnings[0], /does not combine/)
  const controller = new AbortController()
  await assert.rejects(runSkyScan(input, { signal: controller.signal, onProgress() { controller.abort() } }), { name: 'AbortError' })
})

test('scan validation rejects oversized grids, invalid masks and excessive work before simulation', () => {
  const input = { targets: [target], events, radii: [1], scrambles: 19 }
  assert.throws(() => runSkyScanCore({ ...input, radii: Array.from({ length: 9 }, (_, i) => i + 1), energyCuts: Array.from({ length: 8 }, (_, i) => i) }), /64 grid cells/)
  assert.throws(() => runSkyScanCore({ ...input, scrambles: 1.2 }), /integer/)
  assert.throws(() => runSkyScanCore({ ...input, events: { length: 1, columns: { ra: [0], dec: [0] }, indices: [1] } }), /invalid row/)
  assert.throws(() => runSkyScanCore({ ...input, events: { length: 1, columns: { ra: [0], dec: [0] }, indices: [0, 0] } }), /duplicate row/)
  assert.throws(() => runSkyScanCore({ ...input, events: [{ ra: 0, dec: 91 }] }), /invalid sky/)
  assert.throws(() => runSkyScanCore({ targets: Array.from({ length: 100 }, (_, id) => ({ ...target, id })), events: Array.from({ length: 1000 }, (_, id) => ({ ra: id % 360, dec: 0 })), radii: [180], scrambles: 2000 }), /work budget/)
})
