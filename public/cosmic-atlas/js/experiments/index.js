import { runExperimentCore } from './core.js'
export { experimentCSV, EXPERIMENT_CAVEATS } from './core.js'
/** Each job owns a worker so cancellation cannot interrupt another experiment. */
export function runExperiment(input, { signal, onProgress = () => {} } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Experiment cancelled', 'AbortError'))
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => runExperimentCore(input, onProgress))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    const finish = (error, result) => { worker.terminate(); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(result) }
    const cancel = () => finish(new DOMException('Experiment cancelled', 'AbortError'))
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = ({ data }) => { if (data.progress !== undefined) onProgress(data.progress); else finish(data.error ? Error(data.error) : null, data.result) }
    worker.onerror = event => finish(Error(event.message || 'Experiment worker failed'))
    worker.postMessage({ id: 1, input })
  })
}
