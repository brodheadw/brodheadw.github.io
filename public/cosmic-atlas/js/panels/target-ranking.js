import { escapeHTML } from '../util.js'
import { formatDistance } from '../astro/units.js'
import { rowAt } from '../data/loaders.js'
import { runExperiment } from '../experiments/index.js'

const defaults = { sample: 'tracks', targets: 'published', radius: 1.5, columns: { distance: true, residual: true, coordinates: false } }
function settings(state) {
  const raw = state.ranking || {}
  return { sample: ['tracks', 'neutrinos', 'fermi'].includes(raw.sample) ? raw.sample : defaults.sample,
    targets: ['published', 'curated', 'galaxies'].includes(raw.targets) ? raw.targets : defaults.targets,
    radius: Number.isFinite(raw.radius) && raw.radius >= .05 && raw.radius <= 90 ? raw.radius : defaults.radius,
    columns: Object.fromEntries(Object.entries(defaults.columns).map(([key, value]) => [key, typeof raw.columns?.[key] === 'boolean' ? raw.columns[key] : value])) }
}

/** Copy before sorting; the pinned study target never changes the count-based ranking. */
export function rankTargetRows(rows) {
  return rows.map(row => {
    if (!Number.isFinite(row.observed) || row.observed < 0 || !Number.isFinite(row.expected) || row.expected < 0) throw Error('Every target count needs a nonnegative chance expectation')
    return { ...row, residual: row.residual ?? (row.expected > 0 ? (row.observed - row.expected) / Math.sqrt(row.expected) : null) }
  }).sort((a, b) => Number(b.name === 'Boötes III') - Number(a.name === 'Boötes III') || b.observed - a.observed || a.name.localeCompare(b.name, 'en'))
}

export default {
  id: 'targets', title: 'Neutrino-ranked targets',
  mount(el, app) {
    el.innerHTML = `<div class="field-row"><label>Ranking sample<select data-setting="sample"><option value="tracks">Published 10-year tracks</option><option value="neutrinos">IceCat-1 alerts</option><option value="fermi">Fermi sources</option></select></label><label>Target list<select data-setting="targets"><option value="published">All 119 published targets</option><option value="curated">Visible curated targets</option><option value="galaxies">Visible galaxies (≤1,000)</option></select></label></div>
      <label>Cone radius (degrees)<input data-setting="radius" type="number" min=".05" max="90" step=".1" value="1.5"></label>
      <fieldset><legend>Columns</legend><label class="check"><input data-column="distance" type="checkbox" checked>Distance</label><label class="check"><input data-column="residual" type="checkbox" checked>Count residual</label><label class="check"><input data-column="coordinates" type="checkbox">ICRS coordinates</label></fieldset>
      <p data-about class="notice"></p><p data-status role="status" aria-live="polite">Loading published targets…</p><ol class="target-list" data-list></ol>
      <p class="notice">Boötes III stays pinned when included. Every observed count is paired with its chance expectation. Count residual (N−E)/√E is descriptive, without trials correction; it is not a p-value, likelihood significance or detection. Alerts, Fermi sources and published tracks are different samples.</p>`
    const input = name => el.querySelector(`[data-setting="${name}"]`), list = el.querySelector('[data-list]'), status = el.querySelector('[data-status]')
    let doc, error, ranked = [], alive = true, generation = 0, controller, inputKey = '', paintKey = '', dependencies = [], revision = 0
    const save = () => {
      const radius = Number(input('radius').value)
      if (!input('radius').disabled && (!input('radius').value || !Number.isFinite(radius) || radius < .05 || radius > 90)) { status.textContent = 'Use a cone radius from 0.05° to 90°.'; return }
      app.store.set({ ranking: { sample: input('sample').value, targets: input('targets').value, radius: input('radius').disabled ? settings(app.store.getState()).radius : radius,
        columns: Object.fromEntries([...el.querySelectorAll('[data-column]')].map(node => [node.dataset.column, node.checked])) } })
    }
    el.querySelectorAll('select,input').forEach(node => { node.onchange = save })
    function targetsFor(config, state) {
      if (config.targets === 'published') return doc.targets.map((row, id) => ({ ...row, id: `published:${id}` }))
      const table = app.tables.get(config.targets), mask = app.masks.get(config.targets)
      if (!table) throw Error('The target position catalog is unavailable.')
      if (!state.layers[config.targets]?.visible) throw Error('Turn on the target layer to rank its visible objects.')
      if ((mask?.length ?? table.length) > 1000) throw Error('Filter the target catalog to at most 1,000 visible objects.')
      return Array.from(mask || { length: table.length }, (value, index) => {
        const id = mask ? value : index
        return { ...rowAt(table, id), sourceLayer: config.targets }
      }).filter(row => row.type !== 'observer')
    }
    function paint(config) {
      const selection = app.selectionRow?.(), key = JSON.stringify([revision, config.columns, selection?.name])
      if (key === paintKey) return; paintKey = key
      list.innerHTML = ranked.map((row, index) => `<li><button data-rank="${index}" class="${row.name === 'Boötes III' ? 'pinned' : ''} ${selection?.name === row.name ? 'current' : ''}"><span>${escapeHTML(row.name)}${row.name === 'Boötes III' ? ' ◈' : ''}${config.columns.coordinates ? `<small>RA ${row.ra.toFixed(2)}°, Dec ${row.dec.toFixed(2)}°</small>` : ''}</span>${config.columns.distance ? `<span class="t-dist">${Number.isFinite(row.mpc) ? formatDistance(row.mpc) : 'Distance unavailable'}</span>` : ''}<span class="t-count"><b>${row.observed} observed</b> / ${row.expected.toFixed(2)} expected${config.columns.residual ? ` · ${Number.isFinite(row.residual) ? (row.residual > 0 ? '+' : '') + row.residual.toFixed(1) + 'σ residual' : 'residual unavailable'}` : ''}</span></button></li>`).join('')
    }
    list.onclick = event => {
      const button = event.target.closest('[data-rank]'); if (!button) return
      const row = ranked[Number(button.dataset.rank)]
      for (const layer of row.sourceLayer ? [row.sourceLayer] : ['curated', 'galaxies']) {
        const table = app.tables.get(layer), id = row.sourceLayer ? row.id : table?.strings.name.indexOf(row.name)
        if (!Number.isInteger(id) || id < 0 || !table) continue
        const old = app.store.getState().layers[layer] || { opacity: 1, filters: {} }, mask = app.masks.get(layer)
        app.store.set({ layers: { [layer]: { ...old, visible: true, filters: mask && !mask.includes(id) ? {} : old.filters } } })
        app.select(layer, id); return
      }
      if (app.selectCustomAnnotation) app.selectCustomAnnotation(row)
      else app.toast('This target has no matching entry in the loaded spatial catalogs.')
    }
    async function refresh() {
      if (!alive) return
      const state = app.store.getState(), config = settings(state), tracks = config.sample === 'tracks'
      for (const name of ['sample', 'targets']) input(name).value = config[name]
      input('radius').disabled = tracks
      if (document.activeElement !== input('radius')) input('radius').value = tracks ? doc?.radius_deg ?? 1.5 : config.radius
      el.querySelectorAll('[data-column]').forEach(node => { node.checked = config.columns[node.dataset.column] })
      paint(config)
      if (!doc) { status.textContent = error ? `Target ranking unavailable: ${error.message}` : 'Loading published targets…'; return }
      const table = app.tables.get(config.sample), targetTable = app.tables.get(config.targets), mask = app.masks.get(config.sample), targetMask = app.masks.get(config.targets)
      const key = JSON.stringify([config.sample, config.targets, config.radius, state.layers[config.targets]?.visible, state.layers[config.sample]?.filters, state.layers[config.targets]?.filters])
      const nextDependencies = [doc, table, targetTable, mask, targetMask]
      if (key === inputKey && nextDependencies.every((value, i) => value === dependencies[i])) return
      inputKey = key; dependencies = nextDependencies; controller?.abort(); controller = new AbortController(); const request = ++generation
      ranked = []; revision++; paint(config)
      try {
        const targets = targetsFor(config, state)
        if (!targets.length) throw Error('No target objects remain after the current filters.')
        if (tracks) {
          const published = new Map(doc.targets.map(row => [row.name, row])), covered = targets.filter(row => published.has(row.name))
          ranked = rankTargetRows(covered.map(row => ({ ...row, observed: published.get(row.name).tracks, expected: published.get(row.name).expected, residual: published.get(row.name).sigma })))
          el.querySelector('[data-about]').textContent = `${doc.events.toLocaleString()} public tracks with reconstructed log₁₀(E/GeV) ≥ ${doc.min_log10e}; fixed published ${doc.radius_deg}° cone. Chance expectation uses the local declination band. Radius is fixed for this cached sample.`
          status.textContent = `${ranked.length} ranked targets${covered.length < targets.length ? `; ${targets.length - covered.length} visible targets lack published track counts and are omitted` : ''}.`
        } else {
          if (!table) throw Error('The direction catalog is unavailable. Check data status.')
          status.textContent = 'Counting filtered directions in a worker…'
          const result = await runExperiment({ targets, events: { ...table, indices: mask }, radius: config.radius, scrambles: 0, targetLayer: config.targets, eventLayer: config.sample,
            filters: { targets: state.layers[config.targets]?.filters || {}, events: state.layers[config.sample]?.filters || {} },
            dataVersions: Object.fromEntries(app.registry.filter(layer => ['curated', 'galaxies', config.sample].includes(layer.id)).map(layer => [layer.id, layer.version || layer.updated_at])) }, { signal: controller.signal })
          if (!alive || request !== generation) return
          ranked = rankTargetRows(result.results.map((row, index) => ({ ...targets[index], observed: row.observed, expected: row.expectedRA })))
          el.querySelector('[data-about]').textContent = `${result.inputs.eventCount.toLocaleString()} filtered ${config.sample === 'neutrinos' ? 'IceCat-1 alerts' : 'Fermi sources'}; ${config.radius}° cone. Chance expectation assumes uniform RA at each event's fixed declination. No scrambles or significance are calculated here.`
          status.textContent = `${ranked.length} ranked targets. Use Angular-coincidence experiment for scrambled backgrounds and recorded trials.`
        }
        revision++; paint(settings(app.store.getState()))
      } catch (failure) { if (alive && request === generation && failure.name !== 'AbortError') { status.textContent = failure.message; el.querySelector('[data-about]').textContent = ''; } }
    }
    const unsubscribe = app.subscribe(refresh)
    app.loadJSON('data/targets.json').then(value => { if (!Array.isArray(value.targets)) throw Error('Published target table has an unsupported schema'); doc = value; refresh() }).catch(failure => { error = failure; refresh() })
    refresh()
    return () => { alive = false; generation++; controller?.abort(); unsubscribe?.() }
  },
}
