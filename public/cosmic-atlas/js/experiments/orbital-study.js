import { validateObserver } from '../astro/satellites.js'
import { validDate } from '../astro/time.js'
import { fingerprint } from './scan.js'

export const ORBITAL_STUDY_LIMITS = Object.freeze({ runs: 12, visibilitySamples: 120 })
export const ORBITAL_STUDY_ASSUMPTIONS = [
  'SGP4 predictions use the already loaded public element snapshot. No new provider request is made by this study.',
  'Passes are geometric elevation crossings without atmospheric refraction, terrain or obstructions. Visibility is sampled at rise, culmination and set only; transitions between samples are not resolved. Observer darkness uses the geometric Sun below the horizon, without a twilight margin.',
  'Optical visibility requires positive elevation, a sunlit satellite and a dark observer in this model. It does not predict magnitude, cloud cover, weather or actual detectability.',
  'Close approaches use the existing coarse screening and local minimization. They can miss encounters and are not official conjunction assessments; covariance, manoeuvres and collision probabilities are unavailable.',
  'Time windows and observers are a deterministic grid. The saved seed is recorded for provenance and is not used to randomize these calculations.',
  'Overlapping observer or start windows may report the same pass or encounter again. Summary totals count result records, not unique physical events.',
  'Cancelling stops the study queue and awaiting its result; an already executing request on the shared tracking worker may still finish in the background.',
]

function cancelled() { return new DOMException('Study cancelled', 'AbortError') }
export function abortable(promise, signal) {
  if (signal?.aborted) return Promise.reject(cancelled())
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancelled()) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(result => { signal.removeEventListener('abort', abort); resolve(result) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}
function observerRecord(observer) {
  validateObserver(observer)
  return { lat: observer.lat, lon: observer.lon, height: observer.height ?? 0, ...(observer.name ? { name: String(observer.name) } : {}) }
}

/** Orchestrates existing tracking-worker methods without loading or propagating another catalog. */
export async function runOrbitalStudy(client, input, { signal, onProgress = () => {} } = {}) {
  if (signal?.aborted) throw cancelled()
  if (!client || typeof client.request !== 'function') throw Error('The loaded satellite client is required')
  const mode = input.mode ?? 'passes'
  if (!['passes', 'close-approaches'].includes(mode)) throw Error('Choose passes or close-approaches')
  const id = String(input.id ?? '')
  if (!/^(?:sat:)?[1-9]\d*$/.test(id)) throw Error('Choose a stable satellite NORAD ID')
  const rawStarts = input.starts ?? [input.date], rawObservers = input.observers ?? [input.observer]
  if (!Array.isArray(rawStarts) || !rawStarts.length || rawStarts.length > ORBITAL_STUDY_LIMITS.runs) throw Error('Choose 1–12 explicit start times')
  const starts = [...new Set(rawStarts.map(value => { if (value == null) throw Error('An explicit UTC start time is required'); return validDate(value).toISOString() }))]
  if (!Array.isArray(rawObservers) || !rawObservers.length) throw Error('Choose at least one observer')
  const observers = mode === 'passes' ? rawObservers.map(observerRecord) : [rawObservers[0] ? observerRecord(rawObservers[0]) : null]
  if (mode === 'close-approaches' && rawObservers.length > 1) throw Error('Close-approach distances are observer-independent; scan start times instead')
  if (starts.length * observers.length > ORBITAL_STUDY_LIMITS.runs) throw Error('Use at most 12 observer/start combinations')
  const hours = Number(input.hours ?? 24), minElevation = Number(input.minElevation ?? 0), distanceKm = Number(input.distanceKm ?? 10), seed = Number(input.seed ?? 1)
  if (!Number.isFinite(hours) || hours < 1 || hours > (mode === 'passes' ? 168 : 72)) throw Error('Unsupported orbital study time window')
  if (!Number.isFinite(minElevation) || minElevation < 0 || minElevation > 90) throw Error('Minimum elevation must be 0–90 degrees')
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 10000) throw Error('Screening distance must be greater than zero and at most 10,000 km')
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Seed must be a uint32 integer')
  let sampleCount = 0
  const runs = [], total = starts.length * observers.length
  onProgress(0)
  const request = (method, args) => { if (signal?.aborted) throw cancelled(); return abortable(client.request(method, args), signal) }
  for (const date of starts) for (const observer of observers) {
    const args = { id, date, hours, ...(observer ? { observer } : {}), ...(mode === 'passes' ? { minElevation } : { distanceKm }) }
    const result = await request(mode === 'passes' ? 'passes' : 'closeApproaches', args), visibilitySamples = []
    if (mode === 'passes') {
      for (const [passIndex, pass] of (result.passes || []).entries()) {
        for (const phase of ['rise', 'culmination', 'set']) {
          if (sampleCount >= ORBITAL_STUDY_LIMITS.visibilitySamples) break
          const details = await request('details', { id, date: pass[phase], observer })
          visibilitySamples.push({ passIndex, phase, utc: pass[phase], elevation: details?.look?.elevation ?? null, azimuth: details?.look?.azimuth ?? null, rangeKm: details?.look?.rangeKm ?? null, visible: Boolean(details?.look?.visible && details.look.elevation >= minElevation), observerDark: details?.look?.observerDark ?? null, illumination: details?.illumination ?? null, shadowFraction: details?.shadowFraction ?? null, ageDays: details?.ageDays ?? null, stale: details?.stale ?? null, snapshot: details?.snapshot ? JSON.parse(JSON.stringify(details.snapshot)) : null })
          sampleCount++
        }
      }
    }
    runs.push({ date, end: new Date(Date.parse(date) + hours * 3600000).toISOString(), observer, result, visibilitySamples, visibilityTruncated: mode === 'passes' && visibilitySamples.length < (result.passes?.length ?? 0) * 3 })
    onProgress(runs.length / total)
  }
  const passCount = runs.reduce((sum, run) => sum + (run.result.passes?.length ?? 0), 0), encounters = runs.flatMap(run => run.result.encounters || [])
  const inputs = { mode, id: id.startsWith('sat:') ? id : `sat:${id}`, starts, observers, hours, minElevation, distanceKm, seed, seedUsed: false, dataVersions: structuredClone(input.dataVersions || {}), snapshot: input.snapshot ? JSON.parse(JSON.stringify(input.snapshot)) : null }
  const epoch = Date.parse(input.snapshot?.elementEpoch ?? input.dataVersions?.epoch), maxElementAgeDays = Number.isFinite(epoch) ? Math.max(...runs.flatMap(run => [Math.abs(Date.parse(run.date) - epoch), Math.abs(Date.parse(run.end) - epoch)])) / 86400000 : null
  return { schema: 1, method: 'orbital-study', created_at: new Date().toISOString(), inputs: { ...inputs, inputFingerprint: fingerprint(inputs) }, runs, summary: { runCount: runs.length, passCount, visiblePeakCount: runs.reduce((sum, run) => sum + run.visibilitySamples.filter(sample => sample.phase === 'culmination' && sample.visible).length, 0), visibilitySampleCount: sampleCount, visibilityTruncated: runs.some(run => run.visibilityTruncated), encounterCount: encounters.length, minimumDistanceKm: encounters.length ? Math.min(...encounters.map(encounter => encounter.distanceKm)) : null, maxElementAgeDays, stale: maxElementAgeDays !== null && maxElementAgeDays > 3 || runs.some(run => run.result.stale || run.visibilitySamples.some(sample => sample.stale)) }, assumptions: ORBITAL_STUDY_ASSUMPTIONS }
}
