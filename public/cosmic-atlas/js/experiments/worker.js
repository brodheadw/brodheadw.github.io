import { runExperimentCore } from './core.js'
import { runSkyScanCore } from './scan.js'
import { prepareBodyStudy } from './body-study.js'
self.onmessage = async ({ data }) => {
  try {
    const core = data.task === 'scan' ? runSkyScanCore : data.task === 'body' ? prepareBodyStudy : runExperimentCore
    const result = await core(data.input, progress => self.postMessage({ id: data.id, progress }))
    self.postMessage({ id: data.id, result })
  } catch (error) { self.postMessage({ id: data.id, error: error.message }) }
}
