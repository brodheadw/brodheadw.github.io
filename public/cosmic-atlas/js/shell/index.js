import { WORKSPACES, workspacePreset } from '../workspaces/index.js'
import { listPresets } from '../presets.js'
import { palette } from '../palette.js'
import { panels } from './panels.js'
import { esc } from './helpers.js'
const $ = id => document.getElementById(id)

export function mountShell(app) {
  const { store } = app
  $('workspace').innerHTML = WORKSPACES.map(w => `<option value="${w.id}">${esc(w.title)}</option>`).join('')
  $('workspace').onchange = e => app.workspace(e.target.value)
  $('view3d').onclick = () => store.set({ view: '3d' })
  $('viewSky').onclick = () => store.set({ view: 'sky' })
  $('asciiView').onclick = () => store.set({ ascii: !store.getState().ascii })
  $('guidesView').onclick = () => store.set({ guides: !store.getState().guides })
  $('logView').onclick = () => store.set({ camera: { log: !store.getState().camera.log } })
  $('freeLook').onclick = () => { if (store.getState().view === 'sky') store.set({ view: '3d' }); app.renderer?.freeLook() }
  $('fullscreenView').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('scene').requestFullscreen?.()
  $('homeView').onclick = () => { const state = store.getState(), preset = workspacePreset(state.workspace); if (state.workspace === 'earth') { const earth = app.bodies.find(b => b.id === 'earth'); if (earth) preset.camera.target = earth.position.map(x => x / 3.0856775814913673e19); preset.camera.mode = 'follow' }; store.set({ camera: preset.camera }) }
  $('clockPause').onclick = () => store.set({ clock: { ...app.snapshotState().clock, paused: !store.getState().clock.paused } })
  $('undo').onclick = () => store.undo(); $('redo').onclick = () => store.redo()
  $('perfToggle').onclick = () => { const hidden = !$('perfReadout').hidden; $('perfReadout').hidden = hidden; $('perfToggle').setAttribute('aria-pressed', String(!hidden)) }
  for (const node of document.querySelectorAll('[data-anchor]')) node.onclick = () => {
    const id = node.dataset.anchor
    const state = store.getState()
    if (id === 'earth') { app.workspace('earth'); return }
    if (id === 'solar') { app.workspace('solar'); return }
    store.set({ view: '3d', camera: { target: [0, 0, 0], distance: id === 'web' ? 150 : id === 'localgroup' ? 1.5 : .04, mode: 'orbit', log: false }, layers: { curated: { visible: true, opacity: 1, filters: {} }, galaxies: { visible: true, opacity: .8, filters: { mpcMax: id === 'web' ? null : id === 'localgroup' ? 5 : .15 } }, solar: { visible: false, opacity: 1, filters: {} }, satellites: { visible: false, opacity: 1, filters: {} } } })
  }
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => dialog.close() })
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close() } })
  }
  $('aboutOpen').onclick = () => $('about').showModal(); $('aboutExplore').onclick = () => $('about').close()
  // The guide stays available without blocking a returning viewer's shared view.
  let panelKey = '', disposers = [], mountedWorkspace = ''
  function mountPanels() {
    const state = store.getState(), workspace = WORKSPACES.find(w => w.id === state.workspace)
    const plugin = app.plugins.get(state.focusLayer), ids = [...new Set([...workspace.panels, ...(plugin?.panels || [])])]
    const prefs = state.panels[state.workspace] || {}, order = [...(prefs.order || []).filter(id => ids.includes(id)), ...ids.filter(id => !(prefs.order || []).includes(id))]
    const key = `${state.workspace}:${state.focusLayer}:${app.registry.length}:${order.join(',')}`
    if (key === panelKey) return
    panelKey = key; mountedWorkspace = state.workspace
    for (const dispose of disposers) dispose?.(); disposers = []; $('panels').replaceChildren()
    for (const id of order) {
      const panel = panels[id]; if (!panel) continue
      const section = document.createElement('details'); section.className = 'panel'; section.dataset.panel = id
      section.open = prefs.open?.[id] ?? !['sources', 'status', 'presets', 'statistics', ...(state.workspace === 'bootes' ? ['layers'] : [])].includes(id)
      section.innerHTML = `<summary><span>${esc(panel.title)}</span><span class="panel-move"><button type="button" data-move="-1" aria-label="Move ${esc(panel.title)} up">↑</button><button type="button" data-move="1" aria-label="Move ${esc(panel.title)} down">↓</button></span></summary><div class="panel-body"></div>`
      section.querySelectorAll('[data-move]').forEach(button => { button.onclick = e => { e.preventDefault(); const next = [...order], index = next.indexOf(id), dest = Math.max(0, Math.min(next.length - 1, index + Number(button.dataset.move))); [next[index], next[dest]] = [next[dest], next[index]]; store.set({ panels: { [state.workspace]: { order: next } } }); persistPanels() } })
      section.ontoggle = () => { if (!section.isConnected || mountedWorkspace !== state.workspace || (store.getState().panels[state.workspace]?.open?.[id] ?? !['sources', 'status', 'presets', 'statistics', ...(state.workspace === 'bootes' ? ['layers'] : [])].includes(id)) === section.open) return; store.set({ panels: { [state.workspace]: { open: { [id]: section.open } } } }, { history: false }); persistPanels() }
      $('panels').append(section)
      try { disposers.push(panel.mount(section.querySelector('.panel-body'), app)) } catch (error) { section.querySelector('.panel-body').textContent = error.message }
    }
  }
  function persistPanels() { try { localStorage.setItem('cosmic-atlas.panels.v1', JSON.stringify(store.getState().panels)) } catch { /* Presets retain panel state when storage is disabled. */ } }
  try { const saved = JSON.parse(localStorage.getItem('cosmic-atlas.panels.v1') || 'null'); if (saved && !location.hash) store.set({ panels: saved }, { history: false }) } catch { /* A broken preference cannot prevent startup. */ }
  function sync() {
    const state = store.getState(), workspace = WORKSPACES.find(w => w.id === state.workspace), row = app.selectionRow()
    $('workspace').value = state.workspace; $('workspaceDescription').textContent = workspace.description
    $('view3d').setAttribute('aria-pressed', String(state.view === '3d')); $('viewSky').setAttribute('aria-pressed', String(state.view === 'sky'))
    $('asciiView').setAttribute('aria-pressed', String(state.ascii)); $('guidesView').setAttribute('aria-pressed', String(state.guides)); $('logView').setAttribute('aria-pressed', String(state.camera.log))
    $('viewportMode').textContent = state.view === 'sky' ? 'HAMMER / ALL SKY' : 'SPATIAL ATLAS'
    $('clockPause').textContent = state.clock.paused ? '▶' : 'Ⅱ'; $('clockPause').setAttribute('aria-label', state.clock.paused ? 'Resume global clock' : 'Pause global clock')
    $('undo').disabled = !store.canUndo(); $('redo').disabled = !store.canRedo()
    $('focusTitle').textContent = row?.name || workspace.title
    $('focusKind').textContent = state.selection?.layer === 'satellites' ? 'PUBLIC ORBIT / PREDICTION' : state.selection?.layer === 'solar' ? 'SOLAR SYSTEM / EPHEMERIS' : state.selection?.layer === 'curated' ? 'INVESTIGATION / NEARBY UNIVERSE' : state.view === 'sky' ? 'OBSERVATORY / DIRECTION SPACE' : 'EXPLORE / THREE DIMENSIONS'
    $('focusNote').textContent = row?.name === 'Boötes III' ? 'Disrupting stellar system / dwarf-galaxy candidate. Angular coincidence, not detection.' : state.selection?.layer === 'solar' ? 'Geometric positions · Astronomy Engine 2.1.19' : state.selection?.layer === 'satellites' ? 'Public GP elements · SGP4 prediction, not telemetry' : workspace.description
    mountPanels()
  }
  app.subscribe(sync); store.subscribe(sync); sync()
  const dialog = $('commands'), input = $('commandSearch'), results = $('commandResults')
  let commands = [], active = 0
  function renderCommands() {
    const text = input.value.trim().toLowerCase(); commands = []
    for (const workspace of WORKSPACES) if (!text || workspace.title.toLowerCase().includes(text)) commands.push({ name: workspace.title, kind: 'Workspace', run: () => app.workspace(workspace.id) })
    for (const layer of app.registry) if (text && layer.title.toLowerCase().includes(text)) commands.push({ name: layer.title, kind: 'Layer', run: () => store.set({ focusLayer: layer.id, layers: { [layer.id]: { visible: true, opacity: .8, filters: {} } } }) })
    if (text.length >= 2) {
      for (const [layer, table] of app.tables) {
        let count = 0
        for (let i = 0; i < table.length && count < 12; i++) if (table.strings.name[i].toLowerCase().includes(text)) { const id = i; commands.push({ name: table.strings.name[id], kind: layer, run: () => { store.set({ layers: { [layer]: { visible: true, opacity: 1, filters: {} } } }); app.select(layer, id) } }); count++ }
      }
      for (const body of app.bodies) if (body.name.toLowerCase().includes(text)) commands.push({ name: body.name, kind: 'Solar System', run: () => { store.set({ layers: { solar: { visible: true, opacity: 1, filters: {} } } }); app.select('solar', body.id) } })
      for (const satellite of app.satellites) if ([satellite.name, satellite.norad, satellite.internationalDesignator].some(x => String(x).toLowerCase().includes(text))) { commands.push({ name: satellite.name, kind: 'Satellite', run: () => app.select('satellites', satellite.index) }); if (commands.length > 70) break }
    }
    for (const preset of listPresets()) if (preset.name.toLowerCase().includes(text)) commands.push({ name: preset.name, kind: 'Saved setup', run: () => store.replace(preset.state) })
    commands = commands.slice(0, 65); active = 0
    results.innerHTML = commands.map((c, i) => `<button data-command="${i}">${esc(c.name)}<small>${esc(c.kind)}</small></button>`).join('') || '<p class="empty">No matching public catalog object.</p>'
    results.querySelectorAll('button').forEach(button => { button.onclick = () => { commands[Number(button.dataset.command)].run(); dialog.close() } })
  }
  $('commandOpen').onclick = () => { input.value = ''; renderCommands(); dialog.showModal(); input.focus() }
  input.oninput = renderCommands
  input.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); dialog.close(); return }; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, Math.min(commands.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); const buttons = results.querySelectorAll('button'); buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === active))); buttons[active]?.scrollIntoView({ block: 'nearest' }) } else if (e.key === 'Enter' && commands[active]) { e.preventDefault(); commands[active].run(); dialog.close() } }
  addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('commandOpen').click() }; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() } })
}
