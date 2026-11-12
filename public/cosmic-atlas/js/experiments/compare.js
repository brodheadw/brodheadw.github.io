import { fingerprint } from './scan.js'

/** Comparison is descriptive; correlated saved runs are never combined into a p-value. */
export function compareRuns(results) {
  if (!Array.isArray(results) || results.length > 100) throw Error('Choose at most 100 saved runs')
  const rows = results.map((result, index) => {
    if (result?.schema !== 1 || !result.inputs || !result.method) throw Error('A saved analysis result is required')
    const best = result.best
    return { id: result.id || index, name: result.name || result.method, method: result.method, observed: best?.observed ?? result.observed ?? null, expected: best?.expectedRA ?? result.expectedRA ?? result.expected ?? null, pValue: result.globalP ?? result.pValue ?? null, correctedP: result.correctedP ?? null, radius: best?.radius ?? result.inputs.radius ?? null, energyCut: best?.energyCut ?? null, scrambles: result.inputs.scrambles ?? null, seed: result.inputs.seed ?? null, pResolution: result.pResolution ?? null, passCount: result.summary?.passCount ?? null, visiblePeakCount: result.summary?.visiblePeakCount ?? null, encounterCount: result.summary?.encounterCount ?? null, minimumDistanceKm: result.minimum?.distanceKm ?? result.summary?.minimumDistanceKm ?? null }
  })
  const warnings = ['Saved runs may share data and are correlated. This comparison does not combine their p-values or select a new trials-corrected winner.']
  const fields = ['method', 'targetLayer', 'eventLayer', 'filters', 'dataVersions', 'maskVersions', 'inputFingerprint', 'radii', 'energyCuts', 'radius', 'useEventError', 'trials', 'id', 'starts', 'observers', 'hours', 'minElevation', 'distanceKm', 'a', 'b', 'samples', 'origin']
  const differences = fields.filter(field => new Set(results.map(result => fingerprint(field === 'method' ? result.method : result.inputs[field] ?? null))).size > 1)
  if (differences.length) warnings.push(`Runs differ in ${differences.join(', ')}; interpret changes with those inputs and versions in view.`)
  return { rows, comparable: differences.length === 0, differences, warnings }
}
