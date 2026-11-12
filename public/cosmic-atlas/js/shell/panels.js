import { esc, $, num, utc, rows, listen, downloadFile, histogram, histogramBars } from './helpers.js'
import { fermiColor } from '../palette.js'
import { rowAt } from '../data/loaders.js'
import { distanceUnits, separation } from '../util.js'
import { icrsToGalactic, icrsToSupergalactic } from '../astro/coords.js'
import { AU_KM, MPC_KM, formatDistance } from '../astro/units.js'
import { bodyRiseSet, EPHEMERIS } from '../astro/solar.js'
import { runExperiment, experimentCSV } from '../experiments/index.js'
import { ringProbability } from '../experiments/core.js'
import { listPresets, savePreset, loadPreset, renamePreset, deletePreset, exportPreset, importPreset } from '../presets.js'
import { writeURLState } from '../url-state.js'
import darkmatter from '../panels/darkmatter.js'
import targetRanking from '../panels/target-ranking.js'
import { segmentBlockedBySphere } from '../render/geometry.js'
import { renderSatelliteInspector } from '../panels/satellite-inspector.js'

const byId = (app, id) => app.registry.find(l => l.id === id)
const selectedLayer = app => byId(app, app.store.getState().focusLayer) || byId(app, app.store.getState().workspace === 'gamma' ? 'fermi' : 'neutrinos')
const setLayer = (app, id, patch) => { const old = app.store.getState().layers[id] || { visible: false, opacity: .8, filters: {} }; const next = structuredClone(app.store.getState()); next.layers[id] = { ...old, ...patch }; app.store.replace(next) }
const allRows = (app, id) => { const table = app.tables.get(id); return table ? Array.from(app.masks.get(id) || { length: table.length }, (_, index) => rowAt(table, app.masks.get(id)?.[index] ?? index)) : [] }
const safeLink = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? esc(u.href) : '#' } catch { return '#' } }
function fail(el, error) { el.innerHTML = `<p class="error">${esc(error.message || error)}</p>` }

const layers = { title: 'Layer browser', mount(el, app) {
  el.innerHTML = '<input class="layer-search" type="search" aria-label="Search layers" placeholder="Filter datasets & surveys…"><div data-list></div><details class="reference-controls"><summary>Reference structures</summary><div data-references></div><p class="notice">The Milky Way outline is a schematic Sun-centred disk. A mass-weighted Local Group barycentre is omitted until a mass model is verified.</p></details><p class="notice">● spatial objects · ◇ sky directions · ▨ sky fields. Up to two sky textures blend in their loading order.</p>'
  const list = $(el, '[data-list]'), search = $(el, 'input'); let signature = ''
  const references = [['equatorial','Equatorial grid'],['galactic','Galactic grid'],['supergalactic','Supergalactic grid'],['galacticPlane','Galactic plane'],['ecliptic','Ecliptic plane'],['disk','Milky Way disk glyph'],['shells','Distance shells: 100 kpc / 1 / 10 / 100 Mpc']]
  $(el, '[data-references]').innerHTML = references.map(([id, label]) => `<label class="check"><input type="checkbox" data-reference="${id}">${label}</label>`).join('')
  el.querySelectorAll('[data-reference]').forEach(input => { input.onchange = () => app.store.set({ guides: true, references: { [input.dataset.reference]: input.checked } }) })
  function build() {
    const query = search.value.toLowerCase(), key = `${app.registry.length}:${query}`
    if (key !== signature) {
      signature = key
      const groups = new Map()
      for (const layer of app.registry.filter(l => `${l.title} ${l.category}`.toLowerCase().includes(query))) { const group = groups.get(layer.category) || []; group.push(layer); groups.set(layer.category, group) }
      list.innerHTML = [...groups].map(([category, values]) => `<div class="layer-group"><div class="layer-category">${esc(category)}</div>${values.map(l => `<div class="layer-row" data-layer="${esc(l.id)}"><input type="checkbox" aria-label="Show ${esc(l.title)}"><button class="layer-name" title="Focus this layer's controls">${l.kind === 'skymap' ? '▨' : l.kind === 'directions' ? '◇' : '●'} ${esc(l.title)}</button><span class="layer-mini"><button data-solo title="Show this dataset alone">S</button><button data-info aria-label="Information about ${esc(l.title)}">i</button></span><div class="layer-options"><input type="range" min="0" max="1" step=".05" aria-label="${esc(l.title)} opacity"><span data-load></span></div><div class="layer-description" hidden><p>${esc(l.note || '')}</p><p><a href="${safeLink(l.citation?.url)}" target="_blank" rel="noopener">${esc(l.citation?.title || 'Source')}</a></p><p class="notice">${esc(l.license || 'License not recorded')}<br>${esc(l.updated_at || 'No update date recorded')}</p></div></div>`).join('')}</div>`).join('') || '<p class="empty">No matching layer.</p>'
      for (const node of list.querySelectorAll('[data-layer]')) {
        const id = node.dataset.layer
        $(node, 'input[type=checkbox]').onchange = e => { setLayer(app, id, { visible: e.target.checked }); if (e.target.checked) app.loadLayer(id) }
        $(node, '.layer-name').onclick = () => app.store.set({ focusLayer: id })
        $(node, '[data-info]').onclick = () => { const info = $(node, '.layer-description'); info.hidden = !info.hidden }
        $(node, '[data-solo]').onclick = () => { const patch = {}; for (const l of app.registry) patch[l.id] = { ...(app.store.getState().layers[l.id] || { opacity: 1, filters: {} }), visible: l.id === id }; app.store.set({ layers: patch, focusLayer: id }); app.loadLayer(id) }
        $(node, 'input[type=range]').oninput = e => setLayer(app, id, { opacity: +e.target.value })
      }
    }
    el.querySelectorAll('[data-reference]').forEach(input => { input.checked = app.store.getState().references?.[input.dataset.reference] ?? ['equatorial','galacticPlane','ecliptic','disk','shells'].includes(input.dataset.reference) })
    for (const node of list.querySelectorAll('[data-layer]')) {
      const id = node.dataset.layer, settings = app.store.getState().layers[id] || {}, status = app.status.get(id), range = $(node, 'input[type=range]')
      $(node, 'input[type=checkbox]').checked = settings.visible
      if (document.activeElement !== range) range.value = settings.opacity ?? 1
      $(node, '[data-load]').textContent = status?.error ? 'UNAVAILABLE' : status?.loading ? 'LOADING' : status?.rows ? `${(app.masks.get(id)?.length ?? status.rows).toLocaleString()}` : settings.visible ? 'ON' : 'OFF'
      $(node, '[data-load]').title = status?.error || ''
      node.style.opacity = settings.visible ? '1' : '.65'
    }
  }
  search.oninput = build; return listen(app, build)
} }

const search = { title: 'Find an object', mount(el, app) {
  el.innerHTML = '<input type="search" aria-label="Find an object" placeholder="Andromeda, Draco, Earth, NORAD ID…"><div class="search-results"></div><p class="notice">Search uses the full catalogs. Picking a result makes its layer visible.</p>'
  const input = $(el, 'input'), result = $(el, '.search-results')
  input.oninput = () => {
    const query = input.value.toLowerCase().trim(), matches = []
    if (query.length < 2) { result.innerHTML = ''; return }
    for (const [layer, table] of app.tables) {
      let count = 0
      for (let i = 0; i < table.length && count < 8; i++) if (table.strings.name[i].toLowerCase().includes(query)) { matches.push({ name: table.strings.name[i], layer, id: i }); count++ }
    }
    for (const body of app.bodies) if (body.name.toLowerCase().includes(query)) matches.push({ name: body.name, layer: 'solar', id: body.id })
    for (const sat of app.satellites) if (`${sat.name} ${sat.norad} ${sat.internationalDesignator}`.toLowerCase().includes(query)) { matches.push({ name: sat.name, layer: 'satellites', id: sat.index }); if (matches.length >= 40) break }
    result.innerHTML = matches.map((m, i) => `<button data-i="${i}">${esc(m.name)}<small>${esc(m.layer)}</small></button>`).join('') || '<p class="empty">No matching catalog object.</p>'
    result.querySelectorAll('button').forEach(b => { b.onclick = () => { const m = matches[+b.dataset.i]; setLayer(app, m.layer, { visible: true, filters: {} }); app.select(m.layer, m.id) } })
  }
} }

const inspector = { title: 'Object inspector', mount(el, app) {
  let key = '', alive = true, pendingSatellite = false, satelliteCleanup = null
  function render() {
    const state = app.store.getState(), row = app.selectionRow(), id = state.selection?.layer
    const signature = `${JSON.stringify(state.selection)}:${id === 'solar' || id === 'satellites' ? Math.floor(app.currentDate().getTime() / 1000) : app.tables.size}`
    if (signature === key) return; key = signature
    if (!row) {
      if (satelliteCleanup) { satelliteCleanup(); satelliteCleanup = null }
      el.innerHTML = id === 'satellites' && String(state.selection.id).startsWith('sat:') ? `<p class="empty">Selected NORAD ${esc(String(state.selection.id).slice(4))} is absent from this snapshot. Choose another object or load a snapshot containing it.</p>` : '<p class="empty">Select a label, sky event or search result to inspect its coordinates and provenance.</p>'; return
    }
    const layer = byId(app, id)
    if (id === 'satellites') {
      if (pendingSatellite) return
      pendingSatellite = true
      app.selectedDetails().then(detail => { if (!alive || JSON.stringify(app.store.getState().selection) !== JSON.stringify(state.selection)) return; satelliteCleanup = renderSatelliteInspector(el, app, row, detail) }).catch(error => fail(el, error)).finally(() => { pendingSatellite = false })
      return
    }
    if (satelliteCleanup) { satelliteCleanup(); satelliteCleanup = null }
    if (id === 'solar') {
      const speed = Math.hypot(...row.velocity), rise = row.id !== 'earth' && !['io', 'europa', 'ganymede', 'callisto'].includes(row.id) ? bodyRiseSet(row.name, app.currentDate(), state.observer) : null
      el.innerHTML = `<div class="info"><span class="badge">SOLAR SYSTEM · GEOMETRIC EQJ</span><h3 class="inspector-title">${esc(row.name)}</h3>${rows([
        ['Heliocentric', `${num(row.heliocentricDistanceKm, 0)} km / ${num(row.heliocentricDistanceKm / AU_KM, 5)} AU`], ['From Earth', `${num(row.geocentricDistanceKm, 0)} km / ${num(row.geocentricDistanceKm / AU_KM, 5)} AU`], ['Light travel', `${num(row.lightMinutes, 3)} min`], ['Speed', `${num(speed, 4)} km/s`], ['Velocity xyz', `${row.velocity.map(v => num(v, 4)).join(', ')} km/s`], ['Geometric RA / Dec', row.geocentricDistanceKm ? `${num(row.ra, 4)}° / ${num(row.dec, 4)}°` : 'Earth observer reference; undefined'], ['Mean radius', `${num(row.radiusKm, 1)} km`], ['Period', `${num(row.periodDays)} d`], ...Object.entries(row.elements || {}).filter(([k]) => ['semiMajorAxisKm','eccentricity','inclination','raan','argumentOfPerigee','meanAnomaly','trueAnomaly'].includes(k)).map(([k,v]) => [{semiMajorAxisKm:'Semi-major axis (km)',eccentricity:'Eccentricity',inclination:'Inclination (°)',raan:'Ascending node (°)',argumentOfPerigee:'Periapsis argument (°)',meanAnomaly:'Mean anomaly (°)',trueAnomaly:'True anomaly (°)'}[k], num(v, 5)]), ['Rise / set', row.id === 'earth' ? 'Not applicable for the observing Earth' : `${rise?.rise ? utc(rise.rise) : 'No rise in next 2d'}<br>${rise?.set ? utc(rise.set) : 'No set in next 2d'}`],
      ])}<p class="notice">${esc(row.coordinateNote)} Ephemeris: ${EPHEMERIS.name} ${EPHEMERIS.version}, ${EPHEMERIS.accuracy}. Osculating elements use each body's stated parent frame.</p></div><div class="actions"><button data-follow>Follow ${esc(row.name)}</button><button data-scale>${state.bodyScale === 'true' ? 'Visible' : 'True'} body sizes</button></div>`
      $(el, '[data-follow]').onclick = () => app.select('solar', row.id)
      $(el, '[data-scale]').onclick = () => { key = ''; app.store.set({ bodyScale: state.bodyScale === 'true' ? 'visible' : 'true' }) }
      return
    }
    const gal = icrsToGalactic(row.ra, row.dec), sg = icrsToSupergalactic(row.ra, row.dec), spatial = Number.isFinite(row.mpc), u = spatial && row.mpc > 0 ? distanceUnits(row.mpc, row.z) : null
    el.innerHTML = `<div class="info"><span class="badge">${spatial ? row.type === 'target' ? 'TARGET · DWARF CANDIDATE' : 'GALAXY / SPATIAL POSITION' : id === 'neutrinos' ? 'NEUTRINO · DIRECTION ONLY' : 'GAMMA RAY · DIRECTION ONLY'}</span><h3 class="inspector-title">${esc(row.name)}</h3>${rows([
      ['ICRS RA / Dec', `${num(row.ra, 4)}° / ${num(row.dec, 4)}°`], ['Galactic l / b', `${num(gal.lon, 4)}° / ${num(gal.lat, 4)}°`], ['Supergalactic L / B', `${num(sg.lon, 4)}° / ${num(sg.lat, 4)}°`],
      ...(u ? [['Distance', u.parsec], ['Light years', u.ly], ['Astronomical units', u.au], ['Kilometres', u.km], ['Light travel', u.travel], ['Distance method', row.type ? 'Approximate literature distance; uncertainty unavailable' : Number.isFinite(row.z) ? 'Redshift → comoving distance; no flow correction' : 'UNGC distance; method / uncertainty unavailable']] : []),
      ...(Number.isFinite(row.z) ? [['Redshift', num(row.z, 6)]] : []),
      ...(id === 'neutrinos' ? [['Energy proxy', Number.isFinite(row.energy) ? `${num(row.energy / 1000, 1)} TeV` : 'Unavailable'], ['Error proxy', `${num(row.err, 3)}° · mean 90% coordinate bounds`]] : []),
      ...(id === 'fermi' ? [['Class', esc(row.cls || 'unassociated')], ['Association', esc(row.assoc || 'unassociated')]] : []),
    ])}<p class="notice">${esc(layer?.note || '')}</p>${spatial ? '<p class="notice">Flat ΛCDM: H₀ = 70 km/s/Mpc, Ωₘ = 0.3. Redshift z &gt; 0.003 uses lookback time.</p>' : '<p class="notice">No source distance is measured. A sphere marker encodes direction only.</p>'}</div><div class="inspector-actions"><a target="_blank" rel="noopener" href="https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(`${row.ra} ${row.dec}`)}&Radius=2&Radius.unit=arcmin">SIMBAD ↗</a><a target="_blank" rel="noopener" href="https://ned.ipac.caltech.edu/conesearch?lon=${row.ra}&lat=${row.dec}&radius=0.0333&search_type=Near%20Position%20Search">NED ↗</a><button data-focus>Fly to object</button></div><label>Nearby sky directions within <span data-radius-label>2</span>°</label><input data-near-radius aria-label="Nearby sky cone radius" type="range" min=".1" max="15" step=".1" value="2"><div data-near class="notice"></div>`
    $(el, '[data-focus]').onclick = () => app.select(id, row.id)
    const nearby = () => {
      const radius = +$(el, '[data-near-radius]').value; $(el, '[data-radius-label]').textContent = radius
      const output = []
      for (const eventLayer of ['neutrinos', 'fermi']) {
        const table = app.tables.get(eventLayer); if (!table) continue
        let count = 0, expected = 0
        for (let i = 0; i < table.length; i++) { if (id === eventLayer && row.id === i) continue; const c = table.columns; if (separation(row.ra, row.dec, c.ra[i], c.dec[i]) <= radius) count++; expected += ringProbability(row.dec, c.dec[i], radius) }
        output.push(`${eventLayer === 'neutrinos' ? 'IceCat-1' : 'Fermi'}: ${count} observed / ${num(expected, 2)} expected (uniform RA at each event's declination)`)
      }
      $(el, '[data-near]').textContent = output.join(' · ') + '. Angular coincidence, not detection.'
    }
    $(el, '[data-near-radius]').oninput = nearby; nearby()
  }
  const off = listen(app, render); return () => { alive = false; satelliteCleanup?.(); off() }
} }

const filters = { title: 'Filters & distribution', mount(el, app) {
  let key = ''
  function render() {
    const layer = selectedLayer(app), table = app.tables.get(layer?.id), ls = app.store.getState().layers[layer?.id]
    const signature = `${layer?.id}:${table?.length}:${JSON.stringify(ls?.filters || {})}`
    if (signature === key || (key && el.contains(document.activeElement) && document.activeElement.matches('input,button'))) { $(el, '[data-count]') && ($(el, '[data-count]').textContent = `${(app.masks.get(layer?.id)?.length ?? table?.length ?? 0).toLocaleString()} objects after filters`); return }; key = signature
    if (!table || !ls) { el.innerHTML = '<p class="empty">Focus a catalog layer to filter its fields.</p>'; return }
    el.innerHTML = `<span class="badge">${esc(layer.title)}</span><div data-fields></div><p class="notice" data-count></p><button data-reset>Clear filters</button><div data-error></div>`
    const controls = $(el, '[data-fields]')
    for (const filter of layer.filters) {
      const group = document.createElement('div'); controls.append(group)
      if (filter.type === 'range') {
        const values = Array.from(table.columns[filter.field] || []).filter(Number.isFinite), min = Math.min(...values), max = Math.max(...values)
        if (!values.length) continue
        group.innerHTML = `<label>${esc(filter.field === 'energy' ? 'Reconstructed energy proxy' : filter.field === 'err' ? 'Direction error proxy' : 'Distance')} · ${esc(filter.unit)}</label>${histogram(values, { label: filter.unit })}<div class="field-row"><label>Minimum<input data-range="min" type="number" step="any" placeholder="${num(min)}" value="${ls.filters[filter.field + 'Min'] ?? ''}" aria-label="Minimum ${esc(filter.field)}"></label><label>Maximum<input data-range="max" type="number" step="any" placeholder="${num(max)}" value="${ls.filters[filter.field + 'Max'] ?? ''}" aria-label="Maximum ${esc(filter.field)}"></label></div>`
        group.querySelectorAll('[data-range]').forEach(input => { input.onchange = () => { const bounds = { min: +$(group, '[data-range=min]').value, max: +$(group, '[data-range=max]').value }; if (input.value && (!Number.isFinite(+input.value) || +input.value < 0)) { $(el, '[data-error]').textContent = 'Use a nonnegative numeric bound.'; return }; $(el, '[data-error]').textContent = ''; const next = { ...app.store.getState().layers[layer.id].filters }; next[filter.field + (input.dataset.range === 'min' ? 'Min' : 'Max')] = input.value === '' ? null : +input.value; setLayer(app, layer.id, { filters: next }) } })
      } else if (filter.type === 'category') {
        const counts = new Map(); for (const value of table.strings[filter.field] || []) counts.set(value || '', (counts.get(value || '') || 0) + 1)
        group.innerHTML = '<label>Fermi class · select one or more</label><div class="chips">' + [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => `<button style="color:${fermiColor(value)}" data-class="${esc(value)}" aria-pressed="${ls.filters.cls?.includes(value) || false}">${esc(value || 'unassociated')} · ${count}</button>`).join('') + '</div>'
        group.querySelectorAll('button').forEach(button => { button.onclick = () => { const values = new Set(app.store.getState().layers[layer.id].filters.cls || []); values.has(button.dataset.class) ? values.delete(button.dataset.class) : values.add(button.dataset.class); setLayer(app, layer.id, { filters: { ...app.store.getState().layers[layer.id].filters, cls: [...values] } }); button.setAttribute('aria-pressed', String(values.has(button.dataset.class))) } })
      } else if (filter.type === 'text') { group.innerHTML = `<label>Catalog text<input type="search" aria-label="Catalog text filter" value="${esc(ls.filters.text || '')}" placeholder="Name or association…"></label>`; $(group, 'input').oninput = e => setLayer(app, layer.id, { filters: { ...app.store.getState().layers[layer.id].filters, text: e.target.value } }) }
    }
    $(el, '[data-reset]').onclick = () => { key = ''; setLayer(app, layer.id, { filters: {} }) }
    $(el, '[data-count]').textContent = `${(app.masks.get(layer.id)?.length ?? table.length).toLocaleString()} objects after filters`
  }
  return listen(app, render)
} }

const targets = targetRanking

const experiment = { title: 'Angular-coincidence experiment', mount(el, app) {
  let result = null, controller, active = true
  el.innerHTML = `<p class="notice">Angular coincidence, not detection. Count a cone or stack targets, then compare with declination-preserving RA scrambles. This is not a likelihood analysis.</p><div class="field-row"><label>Targets<select data-targets><option value="selection">Selected spatial object</option><option value="curated">Visible curated targets (stack)</option><option value="galaxies">Visible galaxy catalog (up to 1000)</option></select></label><label>Directions<select data-events><option value="neutrinos">IceCat-1 alerts</option><option value="fermi">Fermi sources</option></select></label></div><div class="field-row"><label>Radius (degrees)<input data-radius type="number" min=".05" max="90" step=".1" value="1.5"></label><label>RA scrambles<input data-scrambles type="number" min="0" max="10000" step="100" value="500"></label></div><label class="check"><input data-own-error type="checkbox">Use each event's error proxy</label><div class="field-row"><label>Declination half-band (°)<input data-band type="number" min=".1" max="90" value="5" step=".5"></label><label>Trials tested<input data-trials type="number" min="1" value="1" step="1"></label></div><label>Reproducible random seed<input data-seed type="number" value="1" min="0" step="1"></label><div class="actions"><button class="primary" data-run>Run experiment →</button><button data-cancel disabled>Cancel</button></div><div data-result></div><div data-saved></div>`
  const out = $(el, '[data-result]')
  $(el, '[data-run]').onclick = async () => {
    const targetMode = $(el, '[data-targets]').value, eventLayer = $(el, '[data-events]').value, table = app.tables.get(eventLayer)
    if (!table) { fail(out, 'The direction catalog is not available. Check data status.'); return }
    const selected = app.selectionRow(), targets = targetMode === 'selection' ? selected && Number.isFinite(selected.ra) && Number.isFinite(selected.dec) && app.store.getState().selection?.layer !== eventLayer ? [selected] : [] : allRows(app, targetMode).filter(r => r.type !== 'observer')
    if (!targets.length) { fail(out, 'Select a spatial target or choose a nonempty target list.'); return }
    if (targets.length > 1000) { fail(out, 'Filter the target catalog to at most 1,000 objects before stacking.'); return }
    const events = { ...table, indices: app.masks.get(eventLayer) }, state = app.store.getState()
    controller?.abort(); controller = new AbortController(); $(el, '[data-run]').disabled = true; $(el, '[data-cancel]').disabled = false
    out.innerHTML = '<p class="notice">Scrambling right ascensions in a worker…</p><progress max="1" value="0"></progress>'
    try {
      result = await runExperiment({ targets, events, radius: +$(el, '[data-radius]').value, useEventError: $(el, '[data-own-error]').checked, scrambles: +$(el, '[data-scrambles]').value, seed: +$(el, '[data-seed]').value, decBand: +$(el, '[data-band]').value, trials: +$(el, '[data-trials]').value, targetLayer: targetMode === 'selection' ? state.selection.layer : targetMode, eventLayer, filters: { targets: state.layers[targetMode]?.filters || {}, events: state.layers[eventLayer]?.filters || {} }, dataVersions: Object.fromEntries(app.registry.filter(l => ['curated', 'galaxies', eventLayer].includes(l.id)).map(l => [l.id, l.version || l.updated_at])) }, { signal: controller.signal, onProgress: progress => { const bar = $(out, 'progress'); if (bar) bar.value = progress } })
      if (active) showResult()
    } catch (error) { if (active) fail(out, error) }
    finally { if (active) { $(el, '[data-run]').disabled = false; $(el, '[data-cancel]').disabled = true } }
  }
  $(el, '[data-cancel]').onclick = () => controller?.abort()
  function showResult() {
    const r = result
    out.innerHTML = `<div class="result-metrics"><div><span>OBSERVED</span><b>${r.observed}</b></div><div><span>CHANCE EXPECTATION</span><b>${num(r.expected, 2)}</b></div><div><span>LOCAL p / σ</span><b>${r.pValue == null ? 'No trials' : r.pValue.toPrecision(3) + ' / ' + num(r.sigma, 2)}</b></div><div><span>TRIALS-CORRECTED p</span><b>${r.correctedP == null ? '—' : r.correctedP.toPrecision(3)}</b></div></div>${rows([['Uniform-RA expectation', num(r.expectedRA, 3)], ['Declination-band expectation', num(r.expectedDecBand, 3)], ['Setup', `${r.inputs.targetCount} targets · ${r.inputs.eventCount} events`], ['Method', r.inputs.useEventError ? 'Event error proxy' : `${r.inputs.radius}° cone`], ['Background', `${r.inputs.scrambles} RA scrambles, seed ${r.inputs.seed}`], ['Trials factor', `${r.inputs.trials} · Bonferroni`], ['p resolution', r.pResolution ? num(r.pResolution, 6) : 'No scrambles']])}<span class="subtitle">Angular separation histogram</span>${histogramBars(r.histogram.counts, { min: 0, max: r.histogram.edges.at(-1), label: 'degrees' })}<p class="warning">Angular coincidence, not detection. A finite scramble set limits significance. Extra targets, radii and exploratory choices add trials.</p><details><summary>Background assumptions</summary><p class="notice">${r.caveats.map(esc).join('<br><br>')}</p></details><div class="actions"><button data-save>Save as experiment</button><button data-json>Export JSON</button><button data-csv>Export matches CSV</button></div>`
    $(out, '[data-save]').onclick = () => { const state = app.store.getState(); app.store.set({ experiments: [...state.experiments, { ...r, id: crypto.randomUUID(), name: `${r.inputs.targetCount === 1 ? r.inputs.targets[0].name : 'Stack'} / ${eventTitle(r.inputs.eventLayer)}` }] }); app.toast('Experiment saved in this setup. Save or export a preset to keep it.') }
    $(out, '[data-json]').onclick = () => downloadFile('atlas-experiment.json', JSON.stringify(r, null, 2))
    $(out, '[data-csv]').onclick = () => downloadFile('atlas-matches.csv', experimentCSV(r), 'text/csv')
  }
  function eventTitle(id) { return byId(app, id)?.title || id }
  let savedKey = ''
  const off = listen(app, () => {
    const saved = app.store.getState().experiments, key = saved.map(x => x.id).join(','); if (key === savedKey) return; savedKey = key
    const node = $(el, '[data-saved]'); node.innerHTML = saved.length ? '<label>Saved experiments in this setup</label>' + saved.map((r, i) => `<div class="saved-row"><button data-result="${i}">${esc(r.name || r.id || 'Experiment')} · ${r.observed} / ${num(r.expected)} exp</button><button data-delete="${i}" aria-label="Remove experiment">×</button></div>`).join('') : ''
    node.querySelectorAll('[data-result]').forEach(b => { b.onclick = () => { result = saved[+b.dataset.result]; showResult() } }); node.querySelectorAll('[data-delete]').forEach(b => { b.onclick = () => app.store.set({ experiments: saved.filter((_, i) => i !== +b.dataset.delete) }) })
  })
  return () => { active = false; controller?.abort(); off() }
} }

const presets = { title: 'Saved setups & sharing', mount(el, app) {
  el.innerHTML = '<label>Setup name<input data-name type="text" placeholder="My investigation" maxlength="120"></label><div class="actions"><button data-save>Save setup</button><button data-export>Export JSON</button><button data-import>Import JSON</button><button data-link>Copy view link</button></div><input data-file type="file" accept="application/json,.json" hidden><div data-list></div><p class="notice">Setups include layers, filters, camera, UTC clock, panel layout and saved experiments. They stay in this browser; JSON makes them portable.</p>'
  const list = $(el, '[data-list]')
  function render() {
    const records = listPresets()
    list.innerHTML = records.map((r, i) => `<div class="saved-row"><button data-load="${i}">${esc(r.name)}</button><button data-rename="${i}" aria-label="Rename ${esc(r.name)}">✎</button><button data-delete="${i}" aria-label="Delete ${esc(r.name)}">×</button></div>`).join('')
    list.querySelectorAll('[data-load]').forEach(b => { b.onclick = () => app.store.replace(records[+b.dataset.load].state) })
    list.querySelectorAll('[data-rename]').forEach(b => { b.onclick = () => { const record = records[+b.dataset.rename], name = $(el, '[data-name]').value.trim(); if (!name) { app.toast('Enter the new setup name first, then choose rename.'); $(el, '[data-name]').focus(); return }; const result = renamePreset(record.id, name); app.toast(result.ok ? 'Setup renamed.' : result.error); render() } })
    list.querySelectorAll('[data-delete]').forEach(b => { b.onclick = () => { const result = deletePreset(records[+b.dataset.delete].id); app.toast(result.ok ? 'Setup removed from this browser.' : result.error); render() } })
  }
  $(el, '[data-save]').onclick = () => { try { const result = savePreset($(el, '[data-name]').value.trim() || 'My investigation', app.snapshotState()); app.toast(result.ok ? 'Setup saved in this browser.' : result.error); render() } catch (error) { app.toast(error.message) } }
  $(el, '[data-export]').onclick = () => downloadFile('cosmic-atlas-setup.json', exportPreset(app.snapshotState(), $(el, '[data-name]').value.trim() || 'Cosmic Atlas setup'))
  $(el, '[data-import]').onclick = () => $(el, '[data-file]').click()
  $(el, '[data-file]').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { const imported = await importPreset(file); app.store.replace(imported.state); $(el, '[data-name]').value = imported.name; app.toast('Setup restored from JSON.'); } catch (error) { app.toast(error.message) }; e.target.value = '' }
  $(el, '[data-link]').onclick = async () => { try { await writeURLState(app.snapshotState()); await navigator.clipboard.writeText(location.href); app.toast('View link copied, including clock time and experiment settings.') } catch (error) { app.toast(`Link could not be copied: ${error.message}. Use Export JSON.`) } }
  render()
} }

const reproduction = { title: 'Boötes III · likelihood re-run', mount(el, app) {
  el.innerHTML = '<p class="notice">Loading published reproduction…</p>'
  let alive = true
  app.loadJSON('data/bootes_analysis.json').then(data => {
    if (!alive) return
    const o = data.observed, t = data.trials
    el.innerHTML = `<div class="info"><span class="badge">INDEPENDENT PUBLIC-DATA ANALYSIS</span>${rows([['Test statistic', num(o.ts, 2)], ['Fitted signal events', num(o.ns, 1)], ['Background trials', t.n.toLocaleString()], ['Local p / σ', `${t.p_local.toExponential(3)} / ${num(t.sigma_local, 2)}σ`], ['After 3 target trials', `${t.p_post.toExponential(3)} / ${num(t.sigma_post, 2)}σ`]])}<p class="notice">A separate unbinned likelihood re-run on the public 10-year tracks. The mass scan uses a pure νν̄ line, with no electroweak continuum. Broader exploratory choices add trials.</p></div><div class="actions"><a href="bootes.html">Open full reproduction & plots →</a></div><p class="notice">Boötes III is a disrupting stellar system / dwarf-galaxy candidate. Its classification is debated. An excess is not evidence of dark matter.</p>`
  }).catch(e => { if (alive) fail(el, e) })
  return () => { alive = false }
} }

const sources = { title: 'Sources & caveats', mount(el, app) {
  let key = ''
  return listen(app, () => {
    const visible = app.registry.filter(l => app.store.getState().layers[l.id]?.visible), next = visible.map(l => l.id).join(',')
    if (key === next) return; key = next
    el.innerHTML = '<div class="sources-list">' + visible.map(l => `<div><strong>${esc(l.title)}</strong><p><a href="${safeLink(l.citation?.url)}" target="_blank" rel="noopener">${esc(l.citation?.title || 'Source information')}</a></p><p>${esc(l.note || '')}</p><p class="source-label">${esc(l.license || 'License not recorded')}<br>Version ${esc(l.version || '')} · ${esc(l.updated_at || 'Date unavailable')}</p></div>`).join('') + '</div><p class="notice">Angular coincidence, not detection. Overlay textures are for orientation, not photometry. Distances use flat ΛCDM (H₀=70, Ωₘ=0.3); per-object distance uncertainties are shown only when supplied. No 3D dark-matter field is fabricated from the 2D lensing map.</p><p class="notice">Earth day/night textures: <a href="data/textures/sources.json">NASA imagery attribution</a>. Rendering: three.js 0.181.1 (MIT). Ephemerides: Astronomy Engine 2.1.19 (MIT). Orbit propagation: satellite.js 7.1.0 (MIT).</p>'
  })
} }

const status = { title: 'Data status & pipeline', mount(el, app) {
  let pipeline = null, signature = ''
  app.loadJSON('data/pipeline-status.json').then(d => { pipeline = d; render() }).catch(() => {})
  function render() {
    const key = JSON.stringify([...app.status]); if (signature === key && !pipeline) return; signature = key
    el.innerHTML = `<div class="status-list">${app.registry.map(l => { const s = app.status.get(l.id); return `<p><b>${esc(l.title)}</b><br>${s?.error ? `<span class="error">${esc(s.error)}</span>` : s?.ready ? `Loaded ${s.rows ?? ''} ${s.format || ''}` : s?.loading ? 'Loading…' : 'Available on demand'}<br>${esc(l.updated_at || 'No update timestamp')} · ${esc(l.version || '')}</p>` }).join('')}</div><div class="actions"><button data-sync>Recheck loaded catalogs</button><label class="check"><input data-auto type="checkbox">Auto-refresh every 15 min</label></div>${pipeline ? `<details><summary>Last pipeline report</summary><pre class="json-preview">${esc(JSON.stringify(pipeline, null, 2))}</pre></details>` : ''}<p class="notice">A failed dataset leaves the rest of the atlas usable. Satellite snapshot refreshes use a separate data branch and do not trigger the Next.js site build.</p>`
    $(el, '[data-auto]').checked = app.store.getState().syncAuto !== false; $(el, '[data-auto]').onchange = e => app.store.set({ syncAuto: e.target.checked })
    $(el, '[data-sync]').onclick = async e => { e.target.disabled = true; try { await app.syncCatalogs() } catch (error) { app.toast(error.message) }; app.toast('Published dataset availability checked.'); render() }
  }
  return listen(app, render)
} }

const time = { title: 'Global UTC clock', mount(el, app) {
  el.innerHTML = `<div class="field-row"><label>UTC date & time<input data-date type="datetime-local" step="1" min="1972-01-01T00:00:00" aria-label="Global UTC date and time"></label><label>Time rate<select data-rate>${[-1e6, -1000, -1, 1, 10, 100, 1000, 1e4, 1e6].map(x => `<option value="${x}">${x.toLocaleString()}×</option>`).join('')}</select></label></div><div class="actions"><button data-pause>Pause</button><button data-now>Now / 1×</button></div><label class="check"><input data-true type="checkbox">True body radii (may be sub-pixel)</label><p class="notice">One clock drives every body and orbit prediction. UTC→TAI→TT uses the recorded leap-second table through 2017. Earth-fixed orientation assumes UT1−UTC=0 and zero polar motion unless reference values are supplied.</p>`
  $(el, '[data-date]').onchange = e => { const value = e.target.value; if (value && Number.isFinite(Date.parse(value + 'Z'))) app.store.set({ clock: { utc: new Date(value + 'Z').toISOString(), paused: true } }) }
  $(el, '[data-rate]').onchange = e => app.store.set({ clock: { ...app.snapshotState().clock, rate: +e.target.value, paused: false } })
  $(el, '[data-pause]').onclick = () => app.store.set({ clock: { ...app.snapshotState().clock, paused: !app.store.getState().clock.paused } })
  $(el, '[data-now]').onclick = () => app.store.set({ clock: { utc: new Date().toISOString(), rate: 1, paused: false } })
  $(el, '[data-true]').onchange = e => app.store.set({ bodyScale: e.target.checked ? 'true' : 'visible' })
  return listen(app, () => { const state = app.store.getState(); if (document.activeElement !== $(el, '[data-date]')) $(el, '[data-date]').value = app.currentDate().toISOString().slice(0, 19); $(el, '[data-rate]').value = state.clock.rate; $(el, '[data-pause]').textContent = state.clock.paused ? 'Resume' : 'Pause'; $(el, '[data-true]').checked = state.bodyScale === 'true' })
} }

const satellitePanel = { title: 'Public satellite catalog', mount(el, app) {
  let key = '', applyLiveFilters = null
  function render() {
    const signature = `${app.satellites.length}:${app.satelliteStatus}`; if (key === signature) { if (applyLiveFilters && app.satelliteState) applyLiveFilters(); return }; key = signature
    if (!app.satellites.length) { el.innerHTML = `<p class="warning">${esc(app.satelliteStatus || 'No published satellite snapshot is available. Loading snapshot status…')}</p><p class="notice">The app never downloads the full catalog from CelesTrak in each visitor's browser. A scheduled snapshot supplies publicly catalogued objects, including inactive payloads, rocket bodies and debris.</p><a class="notice" href="data/satellites/status.json">Snapshot status & recovery instructions ↗</a>`; return }
    const values = (field) => [...new Set(app.satellites.map(s => s[field]).filter(Boolean))].sort()
    el.innerHTML = `<p class="notice">${app.satellites.length.toLocaleString()} publicly catalogued objects. Predicted from GP elements using SGP4; not live telemetry.</p><input data-search type="search" aria-label="Search satellites" placeholder="ISS, NORAD ID or international designator…"><div class="field-row"><label>Regime<select data-regime><option value="">All</option>${values('regime').map(x => `<option>${esc(x)}</option>`).join('')}</select></label><label>Object type<select data-type><option value="">All</option>${values('objectType').map(x => `<option>${esc(x)}</option>`).join('')}</select></label></div><label>Owner<select data-owner><option value="">All</option>${values('owner').map(x => `<option>${esc(x)}</option>`).join('')}</select></label><div class="field-row"><label>Minimum altitude (km)<input data-alt-min type="number" min="0" step="10"></label><label>Maximum altitude (km)<input data-alt-max type="number" min="0" step="10"></label></div><div class="field-row"><label>Min inclination (°)<input data-inc-min type="number" min="0" max="180"></label><label>Max inclination (°)<input data-inc-max type="number" min="0" max="180"></label></div><label>Launch year<input data-year type="number" min="1957" max="2100" placeholder="Any year"></label><label>Constellation<select data-constellation><option value="">All / unverified group membership</option>${['Starlink', 'OneWeb', 'GPS', 'Galileo', 'GLONASS', 'BeiDou', 'Iridium'].map(x => `<option>${x}</option>`).join('')}</select></label><label class="check"><input data-visible type="checkbox">Visible from my observer now</label><p class="notice" data-count></p><div class="search-results"></div><p class="notice">Constellations use published CelesTrak group membership when available. Offline snapshots without group maps use marked name estimates and may miss members. Use recorded GP epoch and source metadata when interpreting results.</p>`
    const fields = { text: 'search', regime: 'regime', objectType: 'type', owner: 'owner', altitudeMin: 'alt-min', altitudeMax: 'alt-max', inclinationMin: 'inc-min', inclinationMax: 'inc-max', launchYear: 'year', constellation: 'constellation', visibleOnly: 'visible' }
    const update = (fromUI = false) => {
      if (fromUI) {
        const filters = Object.fromEntries(Object.entries(fields).map(([key, selector]) => [key, key === 'visibleOnly' ? $(el, `[data-${selector}]`).checked : $(el, `[data-${selector}]`).value]))
        app.store.set({ layers: { satellites: { filters } } })
      } else {
        const filters = app.store.getState().layers.satellites?.filters || {}
        for (const [key, selector] of Object.entries(fields)) { const input = $(el, `[data-${selector}]`); if (key === 'visibleOnly') input.checked = !!filters[key]; else if (document.activeElement !== input) input.value = filters[key] || '' }
      }
      const query = $(el, '[data-search]').value.toLowerCase(), state = app.satelliteState, ids = []
      for (const [i, sat] of app.satellites.entries()) {
        const alt = state?.geodetic[i * 3 + 2], inc = sat.inclination ?? sat.INCLINATION, type = $(el, '[data-type]').value, regime = $(el, '[data-regime]').value, owner = $(el, '[data-owner]').value, constellation = $(el, '[data-constellation]').value
        if (query && !`${sat.name} ${sat.norad} ${sat.internationalDesignator}`.toLowerCase().includes(query)) continue
        if (type && sat.objectType !== type || regime && sat.regime !== regime || owner && sat.owner !== owner) continue
        if (constellation && (sat.constellationApproximate ? !sat.name.toLowerCase().includes(constellation.toLowerCase()) : sat.constellation !== constellation)) continue
        if ($(el, '[data-year]').value && !String(sat.launchDate).startsWith($(el, '[data-year]').value)) continue
        if ($(el, '[data-visible]').checked && !state?.visible[i]) continue
        if ($(el, '[data-alt-min]').value && !(alt >= +$(el, '[data-alt-min]').value) || $(el, '[data-alt-max]').value && !(alt <= +$(el, '[data-alt-max]').value)) continue
        if ($(el, '[data-inc-min]').value && !(inc >= +$(el, '[data-inc-min]').value) || $(el, '[data-inc-max]').value && !(inc <= +$(el, '[data-inc-max]').value)) continue
        ids.push(i)
      }
      app.renderer?.setSatelliteIndices(Uint32Array.from(ids)); $(el, '[data-count]').textContent = `${ids.length.toLocaleString()} publicly catalogued objects after filters`
      $(el, '.search-results').innerHTML = ids.slice(0, 35).map(i => `<button data-satellite="${i}">${esc(app.satellites[i].name)}<small>${app.satellites[i].norad}</small></button>`).join('') || '<p class="empty">No matching object.</p>'
      el.querySelectorAll('[data-satellite]').forEach(b => { b.onclick = () => app.select('satellites', +b.dataset.satellite) })
    }
    el.querySelectorAll('input,select').forEach(input => { input.oninput = () => update(true) }); applyLiveFilters = update; update()
  }
  return listen(app, render)
} }

const passes = { title: 'Observer & next passes', mount(el, app) {
  el.innerHTML = `<div class="field-row"><label>Latitude (°)<input data-lat type="number" min="-90" max="90" step=".0001"></label><label>Longitude east (°)<input data-lon type="number" min="-180" max="180" step=".0001"></label></div><div class="actions"><button data-location>Use my location</button><button data-passes>Predict next 48 h</button></div><p class="notice">Location stays in this browser and exported setups. Geolocation asks the browser for permission when you choose it. No magnitude is invented from GP elements.</p><div data-out></div>`
  const state = app.store.getState(); $(el, '[data-lat]').value = state.observer.lat; $(el, '[data-lon]').value = state.observer.lon
  const apply = () => { try { app.store.set({ observer: { lat: +$(el, '[data-lat]').value, lon: +$(el, '[data-lon]').value } }); return true } catch (error) { fail($(el, '[data-out]'), error); return false } }
  $(el, '[data-lat]').onchange = apply; $(el, '[data-lon]').onchange = apply
  $(el, '[data-location]').onclick = () => { if (!navigator.geolocation) { fail($(el, '[data-out]'), 'Browser geolocation is unavailable. Type coordinates instead.'); return }; navigator.geolocation.getCurrentPosition(pos => { $(el, '[data-lat]').value = pos.coords.latitude.toFixed(5); $(el, '[data-lon]').value = pos.coords.longitude.toFixed(5); apply() }, e => fail($(el, '[data-out]'), e.message)) }
  let active = true
  $(el, '[data-passes]').onclick = async e => {
    const selection = app.store.getState().selection, sat = selection?.layer === 'satellites' ? app.selectionRow() : null, out = $(el, '[data-out]')
    if (!sat) { fail(out, 'Choose a satellite from a published snapshot first.'); return }; if (!apply()) return
    out.textContent = 'Searching horizon crossings in a worker…'; e.target.disabled = true
    try { const result = await app.client.request('passes', { id: sat.id, date: app.currentDate().toISOString(), observer: app.store.getState().observer, hours: 48 }); if (active) out.innerHTML = `<p class="notice">${esc(result.method || result.note || 'Predicted horizon crossings from public GP elements.')}</p>${(result.passes || result).length ? (result.passes || result).map(pass => `<div class="info">${rows([['Rise', utc(pass.rise)], ['Culmination', utc(pass.culmination)], ['Set', utc(pass.set)], ['Max elevation', `${num(pass.maxElevation)}°`]])}</div>`).join('') : '<p class="empty">No horizon crossings in this time window.</p>'}` } catch (error) { if (active) fail(out, error) } finally { if (active) e.target.disabled = false }
  }
  return () => { active = false }
} }

const measure = { title: 'Measure & screen', mount(el, app) {
  let optionsKey = '', measureTimer, active = true
  el.innerHTML = '<div class="field-row"><label>Object A<select data-a></select></label><label>Object B<select data-b></select></label></div><button data-measure>Measure live distance</button><div data-result></div><details><summary>Satellite close-approach estimate</summary><label>Search radius (km)<input data-radius type="number" min="1" max="1000" value="10"></label><label>Window (hours)<select data-hours><option>24</option><option>48</option><option>72</option></select></label><button data-screen>Screen selected satellite</button><p class="warning">Screening estimate from public GP data, not an official conjunction assessment. Element age, missed manoeuvres and coarse sampling can miss encounters.</p><div data-screen-result></div></details>'
  function updateOptions() {
    const key = `${app.bodies.length}:${app.satellites.length}`; if (optionsKey === key) return; optionsKey = key
    const options = '<option value="observer">Observer ground point</option>' + app.bodies.map(b => `<option value="solar:${b.id}">${esc(b.name)}</option>`).join('') + app.satellites.map(s => `<option value="${esc(s.id)}">${esc(s.name)} / ${s.norad}</option>`).join('')
    $(el, '[data-a]').innerHTML = $(el, '[data-b]').innerHTML = options; $(el, '[data-a]').value = 'solar:earth'; $(el, '[data-b]').value = 'solar:moon'
  }
  async function run() {
    const a = $(el, '[data-a]').value, b = $(el, '[data-b]').value, out = $(el, '[data-result]')
    const get = id => app.bodies.find(x => `solar:${x.id}` === id), aa = get(a), bb = get(b)
    if (aa && bb) { const position = aa.position.map((v, i) => v - bb.position[i]), velocity = aa.velocity.map((v, i) => v - bb.velocity[i]), distance = Math.hypot(...position); out.innerHTML = rows([['Distance', `${num(distance, 0)} km / ${num(distance / AU_KM, 5)} AU`], ['Light time', `${num(distance / 299792.458, 3)} s`], ['Relative speed', `${num(Math.hypot(...velocity), 4)} km/s`], ['Line of sight', app.bodies.filter(body => body.id !== aa.id && body.id !== bb.id).some(body => segmentBlockedBySphere(aa.position, bb.position, body.position, body.radiusKm)) ? 'Blocked by a modeled Solar System body' : 'Clear of modeled Solar System bodies']]); return }
    if (!app.satellites.length) { fail(out, 'Ground-point and satellite measurements need a published satellite snapshot.'); return }
    try { const result = await app.client.request('measure', { a, b, date: app.currentDate().toISOString(), observer: app.store.getState().observer }); if (active) out.innerHTML = `<pre class="json-preview">${esc(JSON.stringify(result, null, 2))}</pre>` } catch (error) { if (active) fail(out, error) }
  }
  $(el, '[data-measure]').onclick = () => { clearInterval(measureTimer); run(); measureTimer = setInterval(run, 1000) }
  $(el, '[data-screen]').onclick = async e => {
    const selection = app.store.getState().selection, sat = selection?.layer === 'satellites' ? app.selectionRow() : null, out = $(el, '[data-screen-result]')
    if (!sat) { fail(out, 'Choose a satellite with a current public snapshot first.'); return }
    e.target.disabled = true; out.textContent = 'Coarse-to-fine screening in a worker…'
    try { const result = await app.client.request('closeApproaches', { id: sat.id, date: app.currentDate().toISOString(), hours: +$(el, '[data-hours]').value, distanceKm: +$(el, '[data-radius]').value }); if (active) out.innerHTML = `<pre class="json-preview">${esc(JSON.stringify(result, null, 2))}</pre>` } catch (error) { if (active) fail(out, error) } finally { if (active) e.target.disabled = false }
  }
  const off = listen(app, updateOptions); return () => { active = false; clearInterval(measureTimer); off() }
} }

const statistics = { title: 'Orbital population statistics', mount(el, app) {
  let key = ''
  return listen(app, () => {
    const state = app.satelliteState, signature = `${app.satellites.length}:${state?.utc?.slice(0, 16)}`; if (key === signature) return; key = signature
    if (!app.satellites.length || !state) { el.innerHTML = '<p class="empty">Statistics become available after a validated public satellite snapshot is published.</p>'; return }
    const counts = field => { const result = new Map(); for (const sat of app.satellites) result.set(sat[field] || 'Unknown', (result.get(sat[field] || 'Unknown') || 0) + 1); return [...result].sort((a, b) => b[1] - a[1]) }
    const altitude = Array.from({ length: app.satellites.length }, (_, i) => state.geodetic[i * 3 + 2])
    el.innerHTML = `<p class="notice">${app.satellites.length.toLocaleString()} publicly catalogued objects, unfiltered snapshot population.</p><span class="subtitle">Altitude (km)</span>${histogram(altitude, { label: 'km', bins: 24 })}<span class="subtitle">By orbit regime</span>${rows(counts('regime').map(([a, b]) => [a, b.toLocaleString()]))}<span class="subtitle">By type</span>${rows(counts('objectType').map(([a, b]) => [a, b.toLocaleString()]))}<span class="subtitle">Top owners</span>${rows(counts('owner').slice(0, 8).map(([a, b]) => [a, b.toLocaleString()]))}<span class="subtitle">Inclination / altitude shells</span><svg class="plot" viewBox="0 0 300 105" role="img" aria-label="Inclination versus altitude scatter">${app.satellites.filter((_, i) => Number.isFinite(altitude[i])).map((s, i) => `<circle cx="${10 + Math.min(180, s.inclination || 0) / 180 * 280}" cy="${85 - Math.min(45000, Math.max(0, altitude[i])) / 45000 * 75}" r=".6" fill="var(--accent)" opacity=".3"/>`).join('')}<text x="10" y="100">0°</text><text x="290" y="100" text-anchor="end">180° · altitude clipped 45,000 km</text></svg><span class="subtitle">Launches by year</span>${histogram(app.satellites.map(s => Number(String(s.launchDate).slice(0, 4))).filter(y => y >= 1957), { label: 'year', bins: 30 })}`
  })
} }

export const panels = { layers, search, inspector, filters, targets, experiment, darkmatter, reproduction, presets, sources, status, time, satellites: satellitePanel, passes, measure, statistics }
