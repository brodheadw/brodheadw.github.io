import { bodiesAt, EPHEMERIS } from '../astro/solar.js'
import { loadSmallBodies, smallBodiesAt, smallBodyCoverage } from '../astro/smallbody.js'
import { validDate } from '../astro/time.js'
import { fingerprint } from './scan.js'

export const BODY_STUDY_ASSUMPTIONS = [
  'Distances and relative speeds use simultaneous geometric heliocentric state vectors, not light-time-corrected apparent positions.',
  'The angular separation is measured from the specified Sun or Earth origin. It is null when one body coincides with that origin.',
  'The minimum is the smallest sampled distance. It is not a refined conjunction, impact probability or forecast of an encounter between samples.',
  'Planetary and lunar vectors use Astronomy Engine; small bodies use the bounded NASA/JPL Horizons sampled ephemeris. No small-body extrapolation is performed.',
  'Sampling is a deterministic uniform time grid. Numerical interpolation accuracy is separate from physical ephemeris or orbit uncertainty.',
]

export function runBodyStudyCore(input, onProgress = () => {}) {
  const a = String(input.a ?? '').replace(/^solar:/, ''), b = String(input.b ?? '').replace(/^solar:/, '')
  if (!a || !b) throw Error('Choose two bodies')
  if (input.date == null) throw Error('An explicit UTC start time is required')
  const start = validDate(input.date).valueOf(), hours = Number(input.hours ?? 24), count = Number(input.samples ?? 121), origin = input.origin ?? 'sun'
  if (!Number.isFinite(hours) || hours <= 0 || hours > 8766) throw Error('Use a positive body-study window of at most one year')
  if (!Number.isInteger(count) || count < 2 || count > 241) throw Error('Use 2–241 time samples')
  if (!['sun', 'earth'].includes(origin)) throw Error('Angular origin must be sun or earth')
  const end = start + hours * 3600000, small = a.startsWith('small:') || b.startsWith('small:'), coverage = small ? JSON.parse(JSON.stringify(smallBodyCoverage())) : null
  if (small && (!coverage.loaded || start < Date.parse(coverage.start) || end > Date.parse(coverage.end))) throw Error(`Small-body study exceeds the sampled ephemeris coverage${coverage.loaded ? ` (${coverage.start} to ${coverage.end})` : '; load the ephemeris first'}. No extrapolation is allowed.`)
  const samples = []
  let names
  onProgress(0)
  for (let i = 0; i < count; i++) {
    const date = new Date(start + (end - start) * i / (count - 1)), bodies = bodiesAt(date), earth = bodies.find(body => body.id === 'earth')
    if (small) bodies.push(...smallBodiesAt(date, { earthPosition: earth.position, earthVelocity: earth.velocity }))
    const first = bodies.find(body => body.id === a), second = bodies.find(body => body.id === b)
    if (!first || !second) throw Error('A selected body is unavailable in this ephemeris or time window')
    names ??= { a: first.name, b: second.name }
    const delta = second.position.map((v, k) => v - first.position[k]), dv = second.velocity.map((v, k) => v - first.velocity[k]), distanceKm = Math.hypot(...delta)
    const offset = origin === 'earth' ? earth.position : [0, 0, 0], p = first.position.map((v, k) => v - offset[k]), q = second.position.map((v, k) => v - offset[k])
    const cross = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
    const angleDegrees = Math.hypot(...p) && Math.hypot(...q) ? Math.atan2(Math.hypot(...cross), p.reduce((sum, v, k) => sum + v * q[k], 0)) * 180 / Math.PI : null
    samples.push({ utc: date.toISOString(), distanceKm, relativeSpeedKmS: Math.hypot(...dv), angleDegrees, rangeRateKmS: distanceKm ? delta.reduce((sum, v, k) => sum + v * dv[k], 0) / distanceKm : 0 })
    onProgress((i + 1) / count)
  }
  const minimum = samples.reduce((best, sample) => sample.distanceKm < best.distanceKm ? sample : best), inputs = { a, b, date: new Date(start).toISOString(), hours, samples: count, origin, names, dataVersions: { planets: `${EPHEMERIS.name} ${EPHEMERIS.version}`, ...(coverage ? { smallBodies: coverage } : {}) } }
  return { schema: 1, method: 'body-distance-study', created_at: new Date().toISOString(), inputs: { ...inputs, inputFingerprint: fingerprint(inputs) }, samples, summary: { minimumDistanceKm: minimum.distanceKm, minimumUtc: minimum.utc, relativeSpeedAtMinimumKmS: minimum.relativeSpeedKmS, angularSeparationAtMinimumDegrees: minimum.angleDegrees, sampleIntervalSeconds: hours * 3600 / (count - 1), sampleCount: count, start: samples[0].utc, end: samples.at(-1).utc }, units: { distance: 'km', velocity: 'km/s', angle: 'degrees', time: 'UTC' }, model: { planets: EPHEMERIS, smallBodies: coverage, angularOrigin: origin }, assumptions: BODY_STUDY_ASSUMPTIONS }
}

export async function prepareBodyStudy(input, onProgress = () => {}) {
  if ([input.a, input.b].some(id => String(id).startsWith('small:')) && (input.smallBodiesUrl || !smallBodyCoverage().loaded)) {
    const url = new URL(input.smallBodiesUrl || 'data/smallbodies/ephemerides.json', new URL('../../', import.meta.url)).href
    await loadSmallBodies(url)
  }
  return runBodyStudyCore(input, onProgress)
}
