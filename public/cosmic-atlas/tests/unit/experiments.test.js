import test from 'node:test'
import assert from 'node:assert/strict'
import { runExperimentCore, ringProbability, experimentCSV } from '../../js/experiments/core.js'

test('cone matches own-error radii with seeded reproducible RA backgrounds', () => {
  const input = { targets: [{ id: 't', name: 'Target', ra: 0, dec: 0 }], events: [{ name: 'close', ra: 0.2, dec: 0, err: 0.3 }, { name: 'far', ra: 30, dec: 0, err: 1 }], useEventError: true, scrambles: 200, seed: 42, trials: 4 }
  const result = runExperimentCore(input), repeat = runExperimentCore(input)
  assert.equal(result.observed, 1)
  assert.equal(result.matches[0].event, 'close')
  assert.deepEqual(result.scrambleCounts, repeat.scrambleCounts)
  assert.ok(result.pValue >= 1 / 201)
  assert.equal(result.correctedP, Math.min(1, 4 * result.pValue))
  assert.ok(result.expectedRA > 0)
  assert.ok(result.expectedDecBand > 0)
  assert.match(result.caveats[0], /not detection/)
  assert.match(experimentCSV(result), /separation/)
  assert.throws(() => runExperimentCore({ ...input, events: [{ ra: 1, dec: 0 }] }))
})

test('analytic declination-band expectation has no artificial isotropic excess', () => {
  const events = []
  // Equal-area deterministic sphere: RA and sin(dec), not uniformly spaced declination.
  for (let a = 0; a < 360; a++) for (let b = 0; b < 180; b++) events.push({ ra: a + 0.5, dec: Math.asin(-1 + (b + 0.5) / 90) * 180 / Math.PI })
  const result = runExperimentCore({ targets: [{ ra: 180, dec: 0 }], events, radius: 10, scrambles: 0, decBand: 15 })
  const z = (result.observed - result.expectedDecBand) / Math.sqrt(result.expectedDecBand)
  assert.ok(Math.abs(z) < 0.35, `isotropic count residual ${z}`)
  assert.equal(result.pValue, null)
})

test('stacking counts overlapping targets consistently and handles poles', () => {
  const result = runExperimentCore({ targets: [{ id: 1, ra: 0, dec: 90 }, { id: 2, ra: 90, dec: 90 }], events: [{ ra: 20, dec: 89 }], radius: 2, scrambles: 20 })
  assert.equal(result.observed, 2)
  assert.equal(result.expected, 2)
  assert.equal(result.pValue, 1)
  assert.equal(result.sigma, 0)
  assert.equal(ringProbability(90, 89, 2), 1)
})
