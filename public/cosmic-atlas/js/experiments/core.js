import { separation, DEG } from '../astro/coords.js'
export const EXPERIMENT_CAVEATS = [
  'Angular coincidence, not detection. This count test is not a likelihood analysis.',
  'RA scrambling preserves event declinations and approximates time-averaged detector acceptance; it assumes exposure is uniform in right ascension.',
  'Declination-band estimates assume locally constant acceptance and become approximate where acceptance changes rapidly.',
  'Stacked counts count a track once for each overlapping target cone; targets are correlated. Scrambles use the same counting rule.',
  'Trials correction covers only the stated number of tested hypotheses; unreported exploratory choices are additional trials.',
  'Monte Carlo p-values use the plus-one correction; significance cannot exceed the finite scramble resolution.',
]
function finite(value, name) { if (!Number.isFinite(value)) throw Error(`${name} must be finite`); return value }
function rows(input, name) {
  if (Array.isArray(input)) return input.map((row, id) => ({ ...row, id: row.id ?? id }))
  if (!input?.columns?.ra || !input.columns.dec || !Number.isInteger(input.length)) throw Error(`${name} must be rows or a columnar table`)
  const indices = input.indices || Array.from({ length: input.length }, (_, index) => index)
  return Array.from(indices, id => ({ id, ra: input.columns.ra[id], dec: input.columns.dec[id], err: input.columns.err?.[id], name: input.strings?.name?.[id] || `${name} ${id + 1}` }))
}
export function seededRandom(seed = 1) {
  let value = Number(seed) >>> 0
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
/** Exact probability of a uniform RA on the event's fixed declination ring. */
export function ringProbability(targetDec, eventDec, radius) {
  if (radius >= 180) return 1
  const a = targetDec * DEG, b = eventDec * DEG, divisor = Math.cos(a) * Math.cos(b)
  if (Math.abs(divisor) < 1e-14) return separation(0, targetDec, 0, eventDec) <= radius ? 1 : 0
  const threshold = (Math.cos(radius * DEG) - Math.sin(a) * Math.sin(b)) / divisor
  return threshold <= -1 ? 1 : threshold >= 1 ? 0 : Math.acos(threshold) / Math.PI
}
/** Acklam inverse-normal approximation; endpoints deliberately handled by the caller. */
function inverseNormal(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924]
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857]
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878]
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742]
  const polynomial = (values, x) => values.reduce((sum, value) => sum * x + value, 0)
  if (p < 0.02425 || p > 0.97575) {
    const q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p))
    const value = polynomial(c, q) / (polynomial(d, q) * q + 1)
    return p < 0.5 ? value : -value
  }
  const q = p - 0.5, r = q * q
  return polynomial(a, r) * q / (polynomial(b, r) * r + 1)
}
function poissonTail(observed, expected) {
  if (observed === 0) return 1
  if (expected === 0) return 0
  // shortcut: large Poisson means use a continuity-corrected normal tail; RA scrambles remain the primary p-value.
  if (expected > 500) {
    const x = (observed - 0.5 - expected) / Math.sqrt(expected * 2)
    const sign = x < 0 ? -1 : 1, t = 1 / (1 + 0.3275911 * Math.abs(x))
    const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x))
    return Math.max(0, Math.min(1, (1 - erf) / 2))
  }
  let probability = Math.exp(-expected), cdf = probability
  for (let k = 1; k < observed; k++) { probability *= expected / k; cdf += probability }
  return Math.max(0, Math.min(1, 1 - cdf))
}
export function runExperimentCore(input, onProgress = () => {}) {
  const targets = rows(input.targets, 'targets'), events = rows(input.events, 'events')
  if (!targets.length || !events.length) throw Error('Choose at least one target and one event')
  if (targets.length > 1000 || events.length > 1_000_000) throw Error('Experiment exceeds the supported input size')
  for (const row of [...targets, ...events]) {
    finite(row.ra, 'RA'); finite(row.dec, 'Dec')
    if (Math.abs(row.dec) > 90) throw Error('Declination must be in −90°…90°')
  }
  const radius = finite(Number(input.radius ?? 1.5), 'Radius')
  if (radius <= 0 || radius > 180) throw Error('Radius must be greater than 0° and at most 180°')
  const useEventError = Boolean(input.useEventError)
  const scrambles = Math.trunc(Number(input.scrambles ?? 200)), trials = Math.trunc(Number(input.trials ?? targets.length))
  const decBand = finite(Number(input.decBand ?? 5), 'Declination band')
  if (scrambles < 0 || scrambles > 10000 || !Number.isFinite(scrambles)) throw Error('Scrambles must be 0–10,000')
  if (trials < 1 || !Number.isFinite(trials)) throw Error('Trials must be a positive integer')
  if (decBand <= 0 || decBand > 90) throw Error('Declination band must be 0°…90°')
  const radii = events.map(event => {
    const value = useEventError ? event.err : radius
    if (!Number.isFinite(value) || value <= 0 || value > 180) throw Error('Own-error matching requires a positive error radius for every selected event')
    return value
  })
  const random = seededRandom(input.seed ?? 1), matches = [], results = targets.map(target => ({ id: target.id, name: target.name || String(target.id), ra: target.ra, dec: target.dec, observed: 0, expectedRA: 0, expectedDecBand: 0 }))
  const maxSeparation = Math.min(180, radii.reduce((maximum, value) => Math.max(maximum, value), Math.max(radius * 3, 5))), bins = 24
  const histogram = { edges: Array.from({ length: bins + 1 }, (_, index) => index * maxSeparation / bins), counts: Array(bins).fill(0) }
  const candidates = targets.map((target, targetIndex) => {
    const indices = []
    events.forEach((event, eventIndex) => {
      const error = radii[eventIndex], result = results[targetIndex]
      result.expectedRA += ringProbability(target.dec, event.dec, error)
      const width = Math.max(decBand, error), low = Math.max(-90, target.dec - width), high = Math.min(90, target.dec + width)
      if (event.dec >= low && event.dec <= high) result.expectedDecBand += (1 - Math.cos(error * DEG)) / (Math.sin(high * DEG) - Math.sin(low * DEG))
      if (Math.abs(event.dec - target.dec) > Math.max(error, maxSeparation)) return
      const angle = separation(target.ra, target.dec, event.ra, event.dec)
      if (angle <= maxSeparation) histogram.counts[Math.min(bins - 1, Math.floor(angle / maxSeparation * bins))]++
      if (Math.abs(event.dec - target.dec) <= error) indices.push(eventIndex)
      if (angle <= error) {
        result.observed++
        matches.push({ targetId: target.id, target: target.name || String(target.id), eventId: event.id, event: event.name || String(event.id), separation: angle, radius: error })
      }
    })
    return indices
  })
  const observed = results.reduce((sum, result) => sum + result.observed, 0), counts = [], individualExceed = Array(targets.length).fill(0)
  let exceed = 0
  const individualTotal = Array(targets.length).fill(0)
  const scrambledRA = new Float64Array(events.length)
  for (let trial = 0; trial < scrambles; trial++) {
    for (let i = 0; i < events.length; i++) scrambledRA[i] = random() * 360
    let total = 0
    targets.forEach((target, index) => {
      let count = 0
      for (const eventIndex of candidates[index]) {
        const event = events[eventIndex]
        if (separation(target.ra, target.dec, scrambledRA[eventIndex], event.dec) <= radii[eventIndex]) count++
      }
      total += count
      individualTotal[index] += count
      if (count >= results[index].observed) individualExceed[index]++
    })
    counts.push(total)
    if (total >= observed) exceed++
    if (trial % 20 === 0) onProgress((trial + 1) / Math.max(1, scrambles))
  }
  const expectedRA = results.reduce((sum, result) => sum + result.expectedRA, 0), expectedDecBand = results.reduce((sum, result) => sum + result.expectedDecBand, 0)
  const expected = scrambles ? counts.reduce((sum, count) => sum + count, 0) / scrambles : expectedRA
  const pValue = scrambles ? (exceed + 1) / (scrambles + 1) : null
  const correctedP = pValue === null ? null : Math.min(1, pValue * trials)
  results.forEach((result, index) => { result.expected = scrambles ? individualTotal[index] / scrambles : result.expectedRA; result.pValue = scrambles ? (individualExceed[index] + 1) / (scrambles + 1) : null; result.poissonP = poissonTail(result.observed, result.expectedDecBand); result.sigma = result.pValue === null || result.pValue >= 0.5 ? 0 : inverseNormal(1 - result.pValue) })
  return {
    schema: 1, method: 'angular-coincidence', created_at: new Date().toISOString(),
    inputs: { radius, useEventError, scrambles, seed: Number(input.seed ?? 1) >>> 0, decBand, trials, targetCount: targets.length, eventCount: events.length, targetIds: targets.map(target => target.id), targets: targets.map(({ id, name, ra, dec }) => ({ id, name: name || String(id), ra, dec })), targetLayer: input.targetLayer || null, eventLayer: input.eventLayer || null, filters: input.filters || {}, dataVersions: input.dataVersions || {} },
    observed, expected, expectedRA, expectedDecBand, pValue, correctedP,
    sigma: pValue === null || pValue >= 0.5 ? 0 : inverseNormal(1 - pValue), correctedSigma: correctedP === null || correctedP >= 0.5 ? 0 : inverseNormal(1 - correctedP),
    pResolution: scrambles ? 1 / (scrambles + 1) : null,
    poissonP: targets.length === 1 ? poissonTail(observed, expectedDecBand) : null,
    results, matches, histogram, scrambleCounts: counts, caveats: EXPERIMENT_CAVEATS,
  }
}
export function experimentCSV(result) {
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const columns = ['targetId', 'target', 'eventId', 'event', 'separation', 'radius']
  return [columns.join(','), ...result.matches.map(match => columns.map(key => quote(match[key])).join(','))].join('\r\n')
}
