// Boots the atlas and mounts the sidebar. To add a panel: write js/panels/<name>.js exporting
// { id, title, open?, mount(el, atlas) } and list it in PANELS. Order here is order on screen.
import { createAtlas } from './core.js'
import targets from './panels/targets.js'
import selected from './panels/selected.js'
import navigate from './panels/navigate.js'
import layers from './panels/layers.js'
import overlays from './panels/overlays.js'
import crossmatch from './panels/crossmatch.js'
import reproduction from './panels/reproduction.js'
import sync from './panels/sync.js'
import sources from './panels/sources.js'
import { $ } from './util.js'

const PANELS = [targets, selected, navigate, layers, overlays, crossmatch, reproduction, sync, sources]

const atlas = createAtlas()

// Each panel is a collapsible section; its open/closed state is remembered per viewer.
const remembered = (() => { try { return JSON.parse(localStorage.getItem('atlas.panels')) || {} } catch { return {} } })()
for (const panel of PANELS) {
  const section = document.createElement('details')
  section.className = 'panel'
  section.open = remembered[panel.id] ?? panel.open !== false
  section.innerHTML = `<summary class="section">${panel.title}</summary><div class="panel-body"></div>`
  section.ontoggle = () => {
    remembered[panel.id] = section.open
    try { localStorage.setItem('atlas.panels', JSON.stringify(remembered)) } catch { /* private mode */ }
  }
  $('panels').append(section)
  panel.mount(section.querySelector('.panel-body'), atlas)
}

// About dialog.
const about = $('about')
$('aboutClose').onclick = () => { about.hidden = true }
$('missionAbout').onclick = () => { about.hidden = false; $('aboutClose').focus({ preventScroll: true }) }
about.addEventListener('click', e => { if (e.target === about) about.hidden = true })
addEventListener('keydown', e => { if (e.key === 'Escape') about.hidden = true })
$('aboutClose').focus({ preventScroll: true })

// Header telemetry, derived from app state; it does not represent instrument connectivity.
atlas.on('sync', s => { $('missionPipeline').textContent = s.lastSync ? 'SYNCED' : s.syncStatus.startsWith('Checking') ? 'CHECKING' : 'NO FEED' })
setInterval(() => { $('missionCount').textContent = $('counter').textContent.replace(/[^0-9,]/g, '') || '—' }, 1500)

// Start on the target.
let started = false
atlas.on('data', () => {
  const target = atlas.data.items.find(x => x.type === 'target')
  if (!started && target) { started = true; atlas.select(target) }
})
atlas.load()
