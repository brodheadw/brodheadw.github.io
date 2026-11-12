import { $, esc, num, rows, downloadFile } from '../shell/helpers.js'
import { rowAt } from '../data/loaders.js'
import { runSkyScan, skyScanCSV } from '../experiments/index.js'
import { mountStudyHistory, saveStudy } from './study-history.js'

export function numberList(text, { min = 0, max = Infinity, limit = 16, label = 'Values' } = {}) {
  const parts = text.trim().split(',').map(x => x.trim())
  if (!parts.length || parts.length > limit || parts.some(x => !x || !Number.isFinite(Number(x)) || Number(x) < min || Number(x) > max)) throw Error(`${label}: enter up to ${limit} comma-separated numbers between ${min} and ${max}.`)
  return [...new Set(parts.map(Number))].sort((a, b) => a - b)
}

function scanPlot(result) {
  const radii = [...new Set(result.cells.map(c => c.radius))], cuts = [...new Set(result.cells.map(c => c.energyCut))]
  const width = 300, left = 56, top = 25, cellWidth = (width - left) / radii.length, cellHeight = 38
  return `<svg class="plot" viewBox="0 0 ${width} ${top + cuts.length * cellHeight + 18}" role="img" aria-label="Parameter scan: observed and expected counts for every radius and energy threshold">${radii.map((r, i) => `<text x="${left + (i + .5) * cellWidth}" y="14" text-anchor="middle">${r}°</text>`).join('')}${cuts.map((cut, j) => `<text x="${left - 5}" y="${top + j * cellHeight + 23}" text-anchor="end">${cut ? num(cut / 1000, 0) + ' TeV' : 'All'}</text>${radii.map((radius, i) => {
    const cell = result.cells.find(c => c.radius === radius && c.energyCut === cut), x = left + i * cellWidth, y = top + j * cellHeight
    return `<g><rect x="${x + 1}" y="${y + 1}" width="${cellWidth - 2}" height="${cellHeight - 2}" fill="var(--accent)" fill-opacity="${Math.min(.75, .08 + .13 * Math.max(0, cell.score))}"/><text x="${x + cellWidth / 2}" y="${y + 22}" text-anchor="middle">${cell.observed}/${num(cell.expected, 1)}</text><title>${radius}°; minimum ${cut} GeV; ${cell.observed} observed / ${cell.expected.toFixed(3)} expected; joint p ${cell.globalP}</title></g>`
  }).join('')}`).join('')}<text x="${width}" y="${top + cuts.length * cellHeight + 14}" text-anchor="end">Observed / expected · radius →</text></svg>`
}

export default { title: 'Sky experiment laboratory', mount(el, app) {
  let result, controller, active = true
  el.innerHTML = `<p class="notice">Scan a declared grid of cone radii and energy thresholds. The same declination-preserving RA scramble is used across the grid, so the global p-value includes the search over these choices.</p><div class="field-row"><label>Target sample<select data-targets><option value="selection">Selected galaxy</option><option value="curated">Visible curated objects (stack)</option><option value="galaxies">Visible galaxies (≤100)</option></select></label><label>Direction sample<select data-events><option value="neutrinos">IceCat-1 alerts</option><option value="fermi">Fermi sources</option></select></label></div><label>Cone radii (degrees, comma separated)<input data-radii value="0.5, 1, 1.5, 2, 3"></label><label>Minimum energy (GeV, comma separated; 0 = all)<input data-cuts value="0, 100000, 300000"></label><div class="field-row"><label>Joint RA scrambles<input data-scrambles type="number" min="19" max="2000" step="20" value="199"></label><label>Random seed<input data-seed type="number" min="0" step="1" value="1"></label></div><label>Additional trials outside this grid<input data-trials type="number" min="1" value="1" step="1"></label><div class="actions"><button data-run class="primary">Run parameter scan →</button><button data-cancel disabled>Cancel scan</button></div><div data-output></div><div data-history></div>`
  const out = $(el, '[data-output]')
  $(el, '[data-events]').onchange = () => { $(el, '[data-cuts]').value = $(el, '[data-events]').value === 'fermi' ? '0' : '0, 100000, 300000' }
  $(el, '[data-cancel]').onclick = () => controller?.abort()
  $(el, '[data-run]').onclick = async () => {
    try {
      const state = app.store.getState(), eventLayer = $(el, '[data-events]').value, targetMode = $(el, '[data-targets]').value, table = app.tables.get(eventLayer)
      if (!table) throw Error('The direction sample has not loaded. Check data status.')
      const selected = app.selectionRow(), targetTable = app.tables.get(targetMode), mask = app.masks.get(targetMode)
      const targets = targetMode === 'selection' ? selected && ['curated', 'galaxies'].includes(state.selection?.layer) ? [selected] : [] : targetTable ? Array.from(mask || { length: targetTable.length }, (_, i) => rowAt(targetTable, mask?.[i] ?? i)).filter(r => r.type !== 'observer') : []
      if (!targets.length || targets.length > 100) throw Error('Choose a galaxy or filter the target sample to 1–100 objects.')
      const radii = numberList($(el, '[data-radii]').value, { min: .01, max: 30, limit: 16, label: 'Cone radii' })
      const energyCuts = numberList($(el, '[data-cuts]').value, { min: 0, max: 1e10, limit: 16, label: 'Energy thresholds' })
      controller?.abort(); controller = new AbortController(); $(el, '[data-run]').disabled = true; $(el, '[data-cancel]').disabled = false
      out.innerHTML = '<p class="notice">Running a joint grid search in a worker…</p><progress max="1" value="0"></progress>'
      result = await runSkyScan({ targets, events: { ...table, indices: app.masks.get(eventLayer) }, radii, energyCuts, scrambles: +$(el, '[data-scrambles]').value, seed: +$(el, '[data-seed]').value, trials: +$(el, '[data-trials]').value, targetLayer: targetMode === 'selection' ? state.selection.layer : targetMode, eventLayer, filters: { targets: state.layers[targetMode === 'selection' ? state.selection.layer : targetMode]?.filters || {}, events: state.layers[eventLayer]?.filters || {} }, dataVersions: Object.fromEntries(app.registry.filter(l => ['curated', 'galaxies', eventLayer].includes(l.id)).map(l => [l.id, l.version || l.updated_at])) }, { signal: controller.signal, onProgress: p => { const bar = $(out, 'progress'); if (bar) bar.value = p } })
      if (active) renderResult()
    } catch (error) { if (active) out.innerHTML = `<p class="error">${esc(error.message)}</p>` }
    finally { if (active) { $(el, '[data-run]').disabled = false; $(el, '[data-cancel]').disabled = true } }
  }
  function renderResult() {
    const r = result, best = r.best
    out.innerHTML = `<div class="result-metrics"><div><span>BEST OBSERVED / EXPECTED</span><b>${best.observed} / ${num(best.expected, 2)}</b></div><div><span>GLOBAL GRID p</span><b>${num(r.globalP, 5)}</b></div></div>${rows([['Best declared cell', `${best.radius}° · energy ≥ ${num(best.energyCut, 0)} GeV`], ['Grid search', `${r.cells.length} cells · ${r.inputs.scrambles} shared RA realizations`], ['Finite p resolution', num(r.pResolution, 6)], ['After additional trials', num(r.correctedP, 5)]])}${scanPlot(r)}<details><summary>Every tested setting</summary><div class="table-scroll"><table class="units"><thead><tr><th>Radius</th><th>Energy ≥ GeV</th><th>Observed / expected</th><th>Local p</th><th>Grid p</th></tr></thead><tbody>${r.cells.map(c => `<tr><td>${c.radius}°</td><td>${num(c.energyCut, 0)}</td><td>${c.observed} / ${num(c.expected, 2)}</td><td>${num(c.localP, 4)}</td><td>${num(c.globalP, 4)}</td></tr>`).join('')}</tbody></table></div></details><p class="warning">Angular coincidence, not detection. This correction covers the declared grid; other target choices and previous explorations add trials. Finite scrambles limit the p-value resolution.</p><details><summary>Method, data versions & assumptions</summary><pre class="json-preview">${esc(JSON.stringify({ inputs: r.inputs, caveats: r.caveats }, null, 2))}</pre></details><label>Study name<input data-name value="${esc(r.inputs.targets?.[0]?.name || 'Stack')} parameter scan" maxlength="120"></label><div class="actions"><button data-save>Save study</button><button data-json>Export scan JSON</button><button data-csv>Export grid CSV</button></div>`
    $(out, '[data-save]').onclick = () => { try { saveStudy(app, r, $(out, '[data-name]').value) } catch (error) { app.toast(error.message) } }
    $(out, '[data-json]').onclick = () => downloadFile('atlas-sky-scan.json', JSON.stringify(r, null, 2))
    $(out, '[data-csv]').onclick = () => downloadFile('atlas-sky-scan.csv', skyScanCSV(r), 'text/csv')
  }
  const off = mountStudyHistory($(el, '[data-history]'), app, { onLoad(run) { if (run.method === 'sky-parameter-scan') { result = run; renderResult() } else app.toast('This record is available in its original experiment panel; use Compare selected runs to inspect it here.') } })
  return () => { active = false; controller?.abort(); off() }
} }
