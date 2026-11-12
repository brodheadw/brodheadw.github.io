import { $, esc, num, listen, downloadFile } from '../shell/helpers.js'

export function studySummary(run) {
  if (run.method === 'sky-parameter-scan') return `${run.best?.observed ?? '—'} observed / ${num(run.best?.expected, 2)} expected · global p ${num(run.globalP, 4)}`
  if (run.method === 'body-distance-study') return `${run.inputs?.a} ↔ ${run.inputs?.b} · ${num(run.summary?.minimumDistanceKm)} km sampled minimum`
  if (run.method === 'orbital-study') return `${run.runs?.length || 0} observer/time combinations · ${run.inputs?.mode || 'public GP'}`
  return `${run.observed ?? '—'} observed / ${num(run.expected, 2)} expected`
}

export function saveStudy(app, result, name) {
  const record = { ...result, id: crypto.randomUUID(), name: name.trim().slice(0, 120) || 'Untitled study', savedAt: new Date().toISOString() }
  app.store.set({ experiments: [...app.store.getState().experiments, record] })
  app.toast('Study saved in this setup. Export the setup or this run to keep it portable.')
  return record
}

export function mountStudyHistory(el, app, { onLoad = () => {} } = {}) {
  let previous = '', chosen = new Set()
  const off = listen(app, () => {
    const saved = app.store.getState().experiments, key = JSON.stringify(saved.map(r => [r.id, r.name, r.savedAt])), idAt = index => saved[index].id || `legacy:${index}`
    if (key === previous) return
    previous = key
    el.innerHTML = `<details><summary>Saved study notebook · ${saved.length}</summary><p class="notice">Select two or more runs to compare their settings and outcomes. Comparisons do not add independent evidence.</p><div data-runs>${saved.map((run, index) => `<div class="saved-row"><input type="checkbox" data-choose="${index}" aria-label="Compare ${esc(run.name || 'study')}" ${chosen.has(idAt(index)) ? 'checked' : ''}><button data-open="${index}">${esc(run.name || 'Angular coincidence')}<small>${esc(studySummary(run))}</small></button><button data-remove="${index}" aria-label="Remove ${esc(run.name || 'study')}">×</button></div>`).join('') || '<p class="empty">No saved runs yet.</p>'}</div><div class="actions"><button data-compare>Compare selected runs</button><button data-export>Export notebook</button></div><div data-comparison></div></details>`
    el.querySelectorAll('[data-choose]').forEach(input => { input.onchange = () => { const id = idAt(+input.dataset.choose); input.checked ? chosen.add(id) : chosen.delete(id) } })
    el.querySelectorAll('[data-open]').forEach(button => { button.onclick = () => onLoad(saved[+button.dataset.open]) })
    el.querySelectorAll('[data-remove]').forEach(button => { button.onclick = () => app.store.set({ experiments: saved.filter((_, i) => i !== +button.dataset.remove) }) })
    $(el, '[data-export]').onclick = () => downloadFile('cosmic-atlas-notebook.json', JSON.stringify({ schema: 1, studies: saved }, null, 2))
    $(el, '[data-compare]').onclick = () => {
      const selected = saved.filter((_, index) => chosen.has(idAt(index))), out = $(el, '[data-comparison]')
      if (selected.length < 2) { out.innerHTML = '<p class="empty">Select at least two saved runs.</p>'; return }
      out.innerHTML = `<p class="warning">Different filters, time windows, observers or catalog versions change the question. Inspect these differences before interpreting an outcome.</p>${selected.map(run => `<div class="info"><strong>${esc(run.name || 'Study')}</strong><p>${esc(studySummary(run))}</p><details><summary>Inputs & data versions</summary><pre class="json-preview">${esc(JSON.stringify(run.inputs || {}, null, 2))}</pre></details></div>`).join('')}`
    }
  })
  return off
}
