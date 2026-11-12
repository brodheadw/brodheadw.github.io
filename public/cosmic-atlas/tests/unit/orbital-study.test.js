import test from 'node:test'
import assert from 'node:assert/strict'
import { runOrbitalStudy } from '../../js/experiments/orbital-study.js'

const pass = { rise: '2019-12-09T12:00:00Z', culmination: '2019-12-09T12:05:00Z', set: '2019-12-09T12:10:00Z', maxElevation: 60 }
const observer = { lat: 40, lon: -74, height: 0 }
const input = { mode: 'passes', id: 'sat:25544', date: pass.rise, observer, hours: 1, seed: 42, snapshot: { fetched_at: '2019-12-09T00:00:00Z', source: 'Historical verification fixture' } }

test('orbital studies reuse the loaded client and save deterministic observer/time grids and visibility assumptions', async () => {
  const calls = [], client = { async request(method, args) {
    calls.push({ method, args })
    if (method === 'passes') return { passes: [pass], stale: false, method: 'existing geometric crossing algorithm' }
    assert.equal(method, 'details')
    return { look: { elevation: args.date === pass.culmination ? 60 : 0, azimuth: 20, rangeKm: 400, visible: true, observerDark: true }, illumination: 'sunlit', shadowFraction: 0, ageDays: 0, stale: false, snapshot: input.snapshot }
  } }
  const result = await runOrbitalStudy(client, { ...input, starts: [pass.rise, '2019-12-10T12:00:00Z'], observers: [observer, { lat: 0, lon: 0, height: 1 }], minElevation: 10 })
  assert.equal(result.runs.length, 4)
  assert.equal(result.summary.passCount, 4)
  assert.equal(result.summary.visiblePeakCount, 4)
  assert.equal(result.summary.visibilitySampleCount, 12)
  assert.equal(result.inputs.seedUsed, false)
  assert.equal(result.inputs.snapshot.source, 'Historical verification fixture')
  assert.ok(result.runs.every(run => run.visibilitySamples.length === 3 && !run.visibilityTruncated))
  assert.equal(calls.filter(call => call.method === 'passes').length, 4)
  assert.equal(calls.filter(call => call.method === 'details').length, 12)
  assert.match(result.assumptions.join(' '), /not predict magnitude, cloud cover/)
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)))
  const aged = await runOrbitalStudy(client, { ...input, hours: 168, snapshot: { elementEpoch: pass.rise } })
  assert.equal(aged.summary.maxElementAgeDays, 7)
  assert.equal(aged.summary.stale, true)
})

test('close-approach studies retain screening caveats without making observer-dependent claims', async () => {
  const client = { async request(method, args) { assert.equal(method, 'closeApproaches'); return { encounters: [{ id: 'sat:42', utc: args.date, distanceKm: 4 }], method: 'existing SGP4 screening' } } }
  const result = await runOrbitalStudy(client, { ...input, mode: 'close-approaches', distanceKm: 10 })
  assert.equal(result.summary.minimumDistanceKm, 4)
  assert.equal(result.summary.encounterCount, 1)
  assert.match(result.assumptions.join(' '), /not official conjunction assessments/)
  await assert.rejects(runOrbitalStudy(client, { ...input, mode: 'close-approaches', observers: [observer, observer] }), /observer-independent/)
})

test('study cancellation stops the queue and visibility sampling is bounded', async () => {
  const controller = new AbortController(), pending = { request: () => new Promise(resolve => setTimeout(() => resolve({ passes: [] }), 20)) }
  const promise = runOrbitalStudy(pending, input, { signal: controller.signal })
  controller.abort()
  await assert.rejects(promise, { name: 'AbortError' })
  const client = { async request(method) { return method === 'passes' ? { passes: Array(50).fill(pass) } : { look: { visible: false, elevation: 0 } } } }
  const bounded = await runOrbitalStudy(client, input)
  assert.equal(bounded.summary.visibilitySampleCount, 120)
  assert.equal(bounded.summary.visibilityTruncated, true)
  await assert.rejects(runOrbitalStudy(client, { ...input, starts: Array.from({ length: 13 }, (_, i) => new Date(Date.parse(input.date) + i * 3600000).toISOString()) }), /1–12/)
})
