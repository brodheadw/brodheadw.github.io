import { DEFAULT_STATE, mergeState, normalizeState } from '../store.js'
import { eclipticView } from '../astro/solar.js'
import { auToMpc } from '../astro/units.js'
export const WORKSPACES = [
  { id: 'explore', title: 'Explore', description: 'Travel from nearby companions to the galaxy web.', panels: ['layers', 'search', 'inspector', 'presets', 'sources'] },
  { id: 'neutrinos', title: 'Neutrinos', description: 'Alert directions, track excess and chance coincidences.', panels: ['filters', 'targets', 'experiment', 'laboratory', 'inspector', 'layers', 'presets', 'sources'] },
  { id: 'dark-matter', title: 'Dark matter', description: 'Compare projected CMB lensing convergence with the galaxy distribution.', panels: ['darkmatter', 'layers', 'inspector', 'presets', 'sources'] },
  { id: 'gamma', title: 'Gamma rays', description: 'Fermi source classes and the diffuse gamma-ray sky.', panels: ['filters', 'inspector', 'experiment', 'laboratory', 'layers', 'presets', 'sources'] },
  { id: 'bootes', title: 'Boötes III study', description: 'A disrupting stellar system / dwarf-galaxy candidate; angular coincidences are not detections.', panels: ['inspector', 'targets', 'layers', 'experiment', 'laboratory', 'reproduction', 'presets', 'sources', 'status'] },
  { id: 'solar', title: 'Solar System', description: 'Physical sizes and J2000 orbits; diamond locators identify bodies too small to resolve.', panels: ['time', 'solar-catalog', 'inspector', 'orbit-study', 'measure', 'layers', 'presets', 'sources'] },
  { id: 'earth', title: 'Earth & satellites', description: 'A physically scaled Earth, dated weather observations and public orbit predictions.', panels: ['satellite-data', 'satellites', 'time', 'inspector', 'passes', 'orbit-study', 'measure', 'earth-weather', 'statistics', 'layers', 'presets', 'sources', 'status'] },
  { id: 'custom', title: 'Custom', description: 'Your own layers, filters, camera and saved experiments.', panels: ['layers', 'search', 'filters', 'inspector', 'experiment', 'laboratory', 'presets', 'sources', 'status'] },
]
const visibility = (...ids) => Object.fromEntries(ids.map(id => [id, { visible: true, opacity: id.startsWith('sky.') ? 0.55 : 1, filters: {} }]))
const patches = {
  explore: { selection: null, camera: { target: [0, 0, 0], distance: 80 }, layers: visibility('curated', 'galaxies', 'sky.optical') },
  neutrinos: { view: 'sky', selection: null, layers: visibility('neutrinos', 'sky.icecube'), focusLayer: 'neutrinos' },
  'dark-matter': { view: 'sky', selection: null, layers: visibility('galaxies', 'sky.lensing', 'sky.lss'), focusLayer: 'sky.lensing' },
  gamma: { view: 'sky', selection: null, layers: visibility('fermi', 'sky.gamma'), focusLayer: 'fermi' },
  bootes: {},
  solar: { bodyScale:'true', selection: null, camera: { target: [0, 0, 0], distance: auToMpc(70), ...eclipticView() }, layers: {...visibility('solar', 'smallbodies', 'sky.optical'),'sky.optical':{visible:true,opacity:.035,filters:{}}} },
  earth: { bodyScale:'true', selection: { layer: 'solar', id: 'earth' }, camera: { target: [0, 0, 0], distance: 24000/3.0856775814913673e19, mode:'follow' }, layers: {...visibility('solar', 'satellites', 'sky.optical'),'sky.optical':{visible:true,opacity:.035,filters:{}},'weather.clouds':{visible:false,opacity:.65,filters:{}}}, focusLayer: 'satellites' },
  custom: {},
}
export function workspacePreset(id) {
  if (!WORKSPACES.some(workspace => workspace.id === id)) throw Error(`Unknown workspace: ${id}`)
  const state = mergeState(DEFAULT_STATE, { workspace: id, ...patches[id] })
  if (id !== 'bootes' && id !== 'custom') {
    for (const layer of Object.values(state.layers)) layer.visible = false
    for (const [layerId, settings] of Object.entries(patches[id].layers || {})) state.layers[layerId] = settings
  }
  if (id === 'explore' || id === 'dark-matter') state.layers.galaxies.filters = {}
  return normalizeState(state)
}
export const workspaceById = id => WORKSPACES.find(workspace => workspace.id === id)
