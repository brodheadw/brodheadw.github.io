import { runExperimentCore } from './core.js'
self.onmessage = ({ data }) => {
  try {
    const result = runExperimentCore(data.input, progress => self.postMessage({ id: data.id, progress }))
    self.postMessage({ id: data.id, result })
  } catch (error) { self.postMessage({ id: data.id, error: error.message }) }
}
