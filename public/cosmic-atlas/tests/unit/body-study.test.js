import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { runBodyStudyCore } from '../../js/experiments/body-study.js'
import { setSmallBodyData } from '../../js/astro/smallbody.js'

test('body distance series is symmetric, retains its uniform time grid and reports a sampled minimum', () => {
  const input = { a: 'earth', b: 'moon', date: '2026-11-12T00:00:00Z', hours: 24, samples: 13 }
  const first = runBodyStudyCore(input), reverse = runBodyStudyCore({ ...input, a: input.b, b: input.a })
  assert.equal(first.method, 'body-distance-study')
  assert.equal(first.samples.length, 13)
  assert.deepEqual(first.samples, reverse.samples)
  assert.equal(first.summary.sampleIntervalSeconds, 7200)
  assert.equal(first.summary.minimumDistanceKm, Math.min(...first.samples.map(sample => sample.distanceKm)))
  assert.ok(first.samples.every(sample => sample.distanceKm > 300000 && sample.distanceKm < 450000 && sample.relativeSpeedKmS > .8 && sample.relativeSpeedKmS < 1.3 && sample.angleDegrees >= 0))
  const identity = runBodyStudyCore({ ...input, b: 'earth', samples: 2 })
  assert.ok(identity.samples.every(sample => sample.distanceKm === 0 && sample.relativeSpeedKmS === 0 && sample.angleDegrees === 0))
  const origin = runBodyStudyCore({ ...input, a: 'sun', samples: 2 })
  assert.ok(origin.samples.every(sample => sample.angleDegrees === null))
})

test('small-body studies use only the validated JPL coverage and refuse extrapolation', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../data/smallbodies/ephemerides.json', import.meta.url)))
  setSmallBodyData(data)
  const input = { a: 'sun', b: 'small:ceres', date: '2026-11-12T00:00:00Z', hours: 24, samples: 3 }
  const result = runBodyStudyCore(input)
  assert.ok(result.samples.every(sample => sample.distanceKm > 1e8 && Number.isFinite(sample.relativeSpeedKmS)))
  assert.equal(result.model.smallBodies.loaded, true)
  assert.throws(() => runBodyStudyCore({ ...input, date: '2025-12-31T23:00:00Z' }), /No extrapolation/)
  assert.throws(() => runBodyStudyCore({ ...input, date: '2027-12-31T23:00:00Z' }), /No extrapolation/)
  assert.throws(() => runBodyStudyCore({ ...input, samples: 242 }), /2–241/)
})
