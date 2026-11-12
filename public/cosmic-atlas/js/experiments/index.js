import { runExperimentCore } from './core.js'
import { runSkyScanCore } from './scan.js'
import { prepareBodyStudy } from './body-study.js'
export { experimentCSV, EXPERIMENT_CAVEATS } from './core.js'
export { skyScanCSV, SKY_SCAN_CAVEATS, SKY_SCAN_LIMITS } from './scan.js'
export { runOrbitalStudy, ORBITAL_STUDY_ASSUMPTIONS, ORBITAL_STUDY_LIMITS } from './orbital-study.js'
export { compareRuns } from './compare.js'
export { BODY_STUDY_ASSUMPTIONS } from './body-study.js'
/** Each job owns a worker so cancellation cannot interrupt another experiment. */
export function runExperiment(input, { signal, onProgress = () => {} } = {}) {
  return runJob('cone', runExperimentCore, input, { signal, onProgress })
}
export function runSkyScan(input, options) { return runJob('scan', runSkyScanCore, input, options) }
export function runBodyStudy(input, options) { return runJob('body', prepareBodyStudy, input, options) }
function runJob(task, core, input, { signal, onProgress = () => {} } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Experiment cancelled', 'AbortError'))
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => core(input, progress => { if (signal?.aborted) throw new DOMException('Experiment cancelled', 'AbortError'); onProgress(progress) }))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    const finish = (error, result) => { worker.terminate(); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(result) }
    const cancel = () => finish(new DOMException('Experiment cancelled', 'AbortError'))
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = ({ data }) => { if (data.progress !== undefined) onProgress(data.progress); else finish(data.error ? Error(data.error) : null, data.result) }
    worker.onerror = event => finish(Error(event.message || 'Experiment worker failed'))
    worker.postMessage({ id: 1, task, input })
  })
}
