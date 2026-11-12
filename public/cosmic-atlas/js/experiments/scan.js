import { separation } from '../astro/coords.js'
import { experimentRows, ringProbability, seededRandom } from './core.js'

export const SKY_SCAN_LIMITS = Object.freeze({ cells: 64, targets: 100, events: 100000, scrambles: 2000, pairs: 2000000, work: 50000000 })
export const SKY_SCAN_CAVEATS = [
  'Angular coincidence, not detection. The count-deviance score orders excesses; it is not a likelihood significance or a Gaussian sigma.',
  'One independent RA per event is drawn for each scramble and reused for every target, radius and energy cut. This preserves correlations from overlapping cones and nested cuts.',
  'The global p-value calibrates the maximum score over the complete stated grid. Extra targets, event samples, grids and exploratory choices outside this run add trials.',
  'Uniform RA at each fixed event declination assumes time-averaged exposure is uniform in right ascension. Event energies and all input masks stay fixed.',
  'A track in overlapping target cones counts once per cone in both observed and scrambled skies. Analytic expectations use the identical counting rule.',
  'All p-values use the plus-one Monte Carlo correction. Their minimum is 1/(scrambles+1), and ties count against an excess.',
  'Background count thresholds describe this conditional null distribution, not injected-signal detection efficiency or flux sensitivity.',
  'An energy cut of zero includes all selected events, including missing energies. Positive cuts exclude events whose energy is missing. Energy is the catalog proxy in GeV, not true particle energy.',
]

function integer(value, label, minimum, maximum) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < minimum || n > maximum) throw Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  return n
}
function axis(values, fallback, label, low, high, includeLow = true) {
  if (!Array.isArray(values ?? fallback) || !(values ?? fallback).length || (values ?? fallback).length > 16) throw Error(`${label} needs 1–16 values`)
  const sorted = [...new Set((values ?? fallback).map(Number))].sort((a, b) => a - b)
  if (sorted.some(value => !Number.isFinite(value) || value > high || (includeLow ? value < low : value <= low))) throw Error(`${label} contains an unsupported value`)
  return sorted
}
function inputRows(input, name, limit) {
  const count = Array.isArray(input) ? input.length : input?.indices?.length ?? input?.length
  if (!Number.isInteger(count) || count < 1 || count > limit) throw Error(`Choose 1–${limit.toLocaleString()} ${name}`)
  if (input?.indices && Array.from(input.indices).some(index => !Number.isInteger(index) || index < 0 || index >= input.length)) throw Error(`${name} mask contains an invalid row index`)
  const result = experimentRows(input, name)
  for (const row of result) {
    if (!Number.isFinite(row.ra) || !Number.isFinite(row.dec) || Math.abs(row.dec) > 90) throw Error(`${name} contains invalid sky coordinates`)
    if (Number.isFinite(row.energy) && row.energy < 0) throw Error(`${name} contains negative energy`)
    if (!['string', 'number'].includes(typeof row.id) || typeof row.id === 'number' && !Number.isFinite(row.id)) throw Error(`${name} contains an invalid ID`)
  }
  if (new Set(result.map(row => String(row.id))).size !== result.length) throw Error(`${name} contains duplicate row IDs; use a unique selection mask`)
  return result
}
export function fingerprint(value) {
  let hash = 2166136261
  const visit = text => { for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) } }
  const encode = item => {
    if (Array.isArray(item)) { visit('['); for (const child of item) { encode(child); visit(',') } visit(']') }
    else if (item && typeof item === 'object') { visit('{'); for (const key of Object.keys(item).sort()) { visit(JSON.stringify(key)); encode(item[key]) } visit('}') }
    else visit(JSON.stringify(item) ?? 'null')
  }
  encode(value)
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}
/** An ordering statistic only. Its distribution is measured by joint RA scrambles. */
export function excessScore(observed, expected) {
  if (observed <= expected || observed === 0) return 0
  return Math.max(0, 2 * (observed * (Math.log(observed) - Math.log(Math.max(Number.MIN_VALUE, expected))) - observed + expected))
}
function firstRadius(radii, angle) {
  let lo = 0, hi = radii.length
  while (lo < hi) { const mid = lo + hi >>> 1; if (radii[mid] < angle) lo = mid + 1; else hi = mid }
  return lo
}

/** Synchronous pure worker engine. Each null sky is shared by the entire predeclared grid. */
export function runSkyScanCore(input, onProgress = () => {}) {
  const limits = SKY_SCAN_LIMITS, targets = inputRows(input.targets, 'targets', limits.targets), events = inputRows(input.events, 'events', limits.events)
  const radii = axis(input.radii, [.5, 1, 2, 5], 'Radii', 0, 180, false), energyCuts = axis(input.energyCuts, [0], 'Energy cuts', 0, 1e12)
  const scrambles = integer(input.scrambles ?? 200, 'Scrambles', 1, limits.scrambles), seed = integer(input.seed ?? 1, 'Seed', 0, 0xffffffff), trials = integer(input.trials ?? 1, 'Additional trials', 1, 1000000)
  if (radii.length * energyCuts.length > limits.cells) throw Error(`Use at most ${limits.cells} grid cells`)
  if (targets.length * events.length > limits.pairs) throw Error('Input pair budget exceeded; filter the event or target catalog')
  const nr = radii.length, cells = energyCuts.flatMap((energyCut, energyIndex) => radii.map((radius, radiusIndex) => ({ radius, energyCut, radiusIndex, energyIndex, eventCount: 0, observed: 0, expectedRA: 0 })))
  const eligible = events.map(event => {
    let last = -1
    for (let e = 0; e < energyCuts.length; e++) if (energyCuts[e] === 0 || Number.isFinite(event.energy) && event.energy >= energyCuts[e]) last = e
    return last
  })
  for (let e = 0; e < energyCuts.length; e++) {
    const count = eligible.reduce((n, last) => n + (last >= e), 0)
    for (let r = 0; r < nr; r++) cells[e * nr + r].eventCount = count
  }
  const pairs = [], maxRadius = radii.at(-1)
  const pairWork = (scrambles + 1) * (1 + energyCuts.length) + nr * energyCuts.length
  for (let t = 0; t < targets.length; t++) for (let i = 0; i < events.length; i++) {
    const event = events[i], target = targets[t]
    if (eligible[i] < 0 || Math.abs(event.dec - target.dec) > maxRadius) continue
    pairs.push({ target: t, event: i })
    if (pairs.length * pairWork > limits.work) throw Error('Scan work budget exceeded; reduce targets, radii, cuts or scrambles')
    for (let r = 0; r < nr; r++) {
      const probability = ringProbability(target.dec, event.dec, radii[r])
      for (let e = 0; e <= eligible[i]; e++) cells[e * nr + r].expectedRA += probability
    }
  }
  const estimatedWork = pairs.length * pairWork
  const count = ras => {
    const counts = new Uint32Array(cells.length)
    for (const pair of pairs) {
      const event = events[pair.event], target = targets[pair.target]
      const r = firstRadius(radii, separation(target.ra, target.dec, ras ? ras[pair.event] : event.ra, event.dec))
      if (r === nr) continue
      for (let e = 0; e <= eligible[pair.event]; e++) counts[e * nr + r]++
    }
    for (let e = 0; e < energyCuts.length; e++) for (let r = 1; r < nr; r++) counts[e * nr + r] += counts[e * nr + r - 1]
    return counts
  }
  const observed = count(), scores = cells.map((cell, i) => excessScore(observed[i], cell.expectedRA)), nullCounts = cells.map(() => []), localExceed = new Uint32Array(cells.length), maxima = []
  const random = seededRandom(seed), ras = new Float64Array(events.length)
  onProgress(0)
  for (let trial = 0; trial < scrambles; trial++) {
    for (let i = 0; i < events.length; i++) ras[i] = random() * 360
    const counts = count(ras)
    let maximum = 0
    cells.forEach((cell, i) => {
      const score = excessScore(counts[i], cell.expectedRA)
      nullCounts[i].push(counts[i]); if (score >= scores[i]) localExceed[i]++
      maximum = Math.max(maximum, score)
    })
    maxima.push(maximum)
    if (trial % 10 === 0 || trial === scrambles - 1) onProgress((trial + 1) / scrambles)
  }
  cells.forEach((cell, i) => {
    cell.observed = observed[i]; cell.expected = cell.expectedRA; cell.score = scores[i]
    cell.scrambleMean = nullCounts[i].reduce((sum, n) => sum + n, 0) / scrambles
    cell.localP = (localExceed[i] + 1) / (scrambles + 1)
    cell.globalP = (maxima.reduce((n, score) => n + (score >= cell.score), 0) + 1) / (scrambles + 1)
  })
  const best = cells.reduce((a, b) => b.score > a.score ? b : a), pResolution = 1 / (scrambles + 1)
  const sensitivity = cells.map((cell, i) => {
    const sorted = [...nullCounts[i]].sort((a, b) => a - b), allowed = Math.floor(.05 * (scrambles + 1) - 1 + 1e-12)
    const requiredCount = allowed < 0 ? null : sorted[scrambles - allowed - 1] + 1
    return { radius: cell.radius, energyCut: cell.energyCut, background95Count: sorted[Math.ceil(.95 * scrambles) - 1], requiredCountForLocalP05: requiredCount, excessFor95Count: requiredCount === null ? null : Math.max(0, requiredCount - cell.expectedRA), canResolve95: allowed >= 0 }
  })
  const eventSignature = events.map(({ id, ra, dec, energy }) => [id, ra, dec, Number.isFinite(energy) ? energy : null]), targetSignature = targets.map(({ id, ra, dec }) => [id, ra, dec])
  return {
    schema: 1, method: 'sky-parameter-scan', created_at: new Date().toISOString(),
    inputs: { radii, energyCuts, scrambles, seed, trials, targetCount: targets.length, eventCount: events.length, targets: targets.map(({ id, name, ra, dec }) => ({ id, name: name || String(id), ra, dec })), eventIds: events.map(event => event.id), targetLayer: input.targetLayer || null, eventLayer: input.eventLayer || null, filters: structuredClone(input.filters || {}), dataVersions: structuredClone(input.dataVersions || {}), maskVersions: { ...input.maskVersions, targetRows: fingerprint(targetSignature), eventRows: fingerprint(eventSignature) }, inputFingerprint: fingerprint({ targets: targetSignature, events: eventSignature }), estimatedWork },
    cells, matrix: energyCuts.map((_, e) => cells.slice(e * nr, (e + 1) * nr)), best, globalP: best.globalP, correctedP: Math.min(1, best.globalP * trials), pResolution,
    cumulative: cells.map(({ radius, energyCut, observed, expectedRA }) => ({ radius, energyCut, observed, expectedRA })), sensitivity, scrambleMaxima: maxima, caveats: SKY_SCAN_CAVEATS,
  }
}

export function skyScanCSV(result) {
  const keys = ['radius', 'energyCut', 'eventCount', 'observed', 'expectedRA', 'scrambleMean', 'score', 'localP', 'globalP']
  return [keys.join(','), ...result.cells.map(cell => keys.map(key => cell[key]).join(','))].join('\r\n')
}
