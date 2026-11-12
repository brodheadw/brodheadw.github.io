import { $, esc, num, rows, utc, listen, downloadFile } from '../shell/helpers.js'
import { runBodyStudy, runOrbitalStudy } from '../experiments/index.js'
import { numberList } from './laboratory.js'
import { mountStudyHistory, saveStudy } from './study-history.js'

export function observerList(text, fallback) {
  if (!text.trim()) return [fallback]
  const result = text.trim().split('\n').map(line => {
    const fields = line.split(',').map(value => value.trim())
    if (fields.length < 2 || fields.length > 3 || fields.some(x => !x || !Number.isFinite(Number(x)))) throw Error('Each observer needs latitude, longitude, optional height in km.')
    const [lat, lon, height = 0] = fields.map(Number)
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || height < -1 || height > 100) throw Error('Observer coordinates are outside the supported range (height −1 to 100 km).')
    return { lat, lon, height }
  })
  if (result.length > 6) throw Error('Use at most six observers per study.')
  return result
}

function distancePlot(samples) {
  if (!samples?.length) return ''
  const values = samples.map(sample => sample.distanceKm), maximum = Math.max(...values), minimum = Math.min(...values), unit = maximum > 1e7 ? 'AU' : 'km', scale = unit === 'AU' ? 149597870.7 : 1
  const path = values.map((value, i) => `${i ? 'L' : 'M'}${15 + i / Math.max(1, values.length - 1) * 270},${80 - (value - minimum) / (maximum - minimum || 1) * 62}`).join(' ')
  return `<svg class="plot" viewBox="0 0 300 112" role="img" aria-label="Geometric distance over the study window"><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="15" y="12">${num(maximum / scale, 4)} ${unit}</text><text x="15" y="96">${num(minimum / scale, 4)} ${unit}</text><text x="15" y="110">Start</text><text x="285" y="110" text-anchor="end">End</text></svg>`
}

export default { title: 'Orbital experiment laboratory', mount(el, app) {
  let result, controller, active = true, bodiesKey = '', studySource = null
  el.innerHTML = `<p class="notice">Save the time window, source elements, observers and numerical assumptions with each result. Predictions are deterministic model outputs; screening is not a collision assessment.</p><label>Study type<select data-mode><option value="body-distance">Solar body-pair distance</option><option value="passes">Satellite passes across observers and start times</option><option value="close-approaches">Satellite close-approach screen</option></select></label><div data-body class="field-row"><label>Body A<select data-body-a></select></label><label>Body B<select data-body-b></select></label></div><div data-satellite hidden><p class="notice" data-selected>Select a satellite in the catalog or import OMM elements first.</p><label>Start offsets (hours, comma separated)<input data-starts value="0"></label><label>Observers: latitude, longitude, height km (one per line)<textarea data-observers rows="3" placeholder="Blank uses the current observer"></textarea></label><div class="field-row"><label>Minimum elevation (degrees)<input data-elevation type="number" min="0" max="90" value="10"></label><label>Screen radius (km)<input data-radius type="number" min=".1" max="10000" value="10"></label></div></div><div class="field-row"><label>Window (hours)<select data-hours><option value="6">6 h</option><option value="24">24 h</option><option value="48">48 h</option><option value="72">72 h</option><option value="168">7 days</option><option value="720">30 days · Solar only</option></select></label><label data-sample-label>Time samples<input data-samples type="number" min="3" max="241" value="121"></label></div><p class="notice">The start time is the shared UTC clock when Run is pressed. Weather imagery is dated separately and is not a future visibility forecast.</p><div class="actions"><button data-run class="primary">Run orbital study →</button><button data-cancel disabled>Cancel study</button></div><div data-output></div><div data-history></div>`
  $(el, '[data-mode]').value = app.store.getState().workspace === 'earth' ? 'passes' : 'body-distance'
  const out = $(el, '[data-output]')
  function modeChanged() {
    const body = $(el, '[data-mode]').value === 'body-distance'
    $(el, '[data-body]').hidden = !body; $(el, '[data-satellite]').hidden = body; $(el, '[data-sample-label]').hidden = !body
    $(el, '[data-hours]').value = body ? '720' : '48'
  }
  $(el, '[data-mode]').onchange = modeChanged; modeChanged()
  const offOptions = listen(app, () => {
    if (studySource !== null && studySource !== JSON.stringify([app.store.getState().satelliteSource, app.satelliteSnapshot])) {
      controller?.abort(); studySource = null
      app.toast('Orbital data changed; the running satellite study was cancelled. Run again with the new source.')
    }
    const key = app.bodies.map(body => body.id).join(',')
    if (key !== bodiesKey) {
      bodiesKey = key
      for (const suffix of ['a', 'b']) {
        const select = $(el, `[data-body-${suffix}]`), previous = select.value
        select.innerHTML = app.bodies.map(body => `<option value="${esc(body.id)}">${esc(body.name)}</option>`).join('')
        select.value = app.bodies.some(body => body.id === previous) ? previous : suffix === 'a' ? 'earth' : 'moon'
      }
    }
    const satellite = app.store.getState().selection?.layer === 'satellites' ? app.selectionRow() : null
    $(el, '[data-selected]').textContent = satellite ? `${satellite.name} · NORAD ${satellite.norad} · element epoch ${utc(satellite.epoch)}` : 'Select a satellite in the catalog or import OMM elements first.'
  })
  $(el, '[data-cancel]').onclick = () => controller?.abort()
  $(el, '[data-run]').onclick = async () => {
    try {
      const mode = $(el, '[data-mode]').value, state = app.store.getState(), date = app.currentDate().toISOString(), hours = +$(el, '[data-hours]').value
      controller?.abort(); controller = new AbortController(); studySource = null; $(el, '[data-run]').disabled = true; $(el, '[data-cancel]').disabled = false
      out.innerHTML = '<p class="notice">Computing the declared window…</p><progress max="1" value="0"></progress>'
      const options = { signal: controller.signal, onProgress: p => { const bar = $(out, 'progress'); if (bar) bar.value = p } }
      if (mode === 'body-distance') {
        result = await runBodyStudy({ a: $(el, '[data-body-a]').value, b: $(el, '[data-body-b]').value, date, hours, samples: +$(el, '[data-samples]').value, ...([$(el, '[data-body-a]').value, $(el, '[data-body-b]').value].some(id => id.startsWith('small:')) ? { smallBodiesUrl: new URL('data/smallbodies/ephemerides.json', location.href).href } : {}) }, options)
      } else {
        const satellite = state.selection?.layer === 'satellites' ? app.selectionRow() : null
        if (!satellite) throw Error('Select a satellite from a validated published or imported snapshot first.')
        studySource = JSON.stringify([state.satelliteSource, app.satelliteSnapshot])
        if (hours > (mode === 'close-approaches' ? 72 : 168)) throw Error('Use at most 72 hours for close-approach screens or 7 days for pass studies.')
        const offsets = numberList($(el, '[data-starts]').value, { min: 0, max: 8766, limit: 12, label: 'Start offsets' })
        const observers = observerList($(el, '[data-observers]').value, state.observer)
        result = await runOrbitalStudy(app.client, { mode, id: satellite.id, date, hours, observer: state.observer, observers, starts: offsets.map(offset => new Date(Date.parse(date) + offset * 3600000).toISOString()), minElevation: +$(el, '[data-elevation]').value, distanceKm: +$(el, '[data-radius]').value, seed: 1, snapshot: { ...app.satelliteSnapshot, elementEpoch: satellite.epoch }, dataVersions: { norad: satellite.norad, epoch: satellite.epoch, snapshotFetchedAt: app.satelliteSnapshot?.fetched_at || null } }, options)
      }
      if (active) renderResult()
    } catch (error) { if (active) out.innerHTML = `<p class="error">${esc(error.message)}</p>` }
    finally { studySource = null; if (active) { $(el, '[data-run]').disabled = false; $(el, '[data-cancel]').disabled = true } }
  }
  function renderResult() {
    const r = result, body = r.method === 'body-distance-study', samples = r.samples || r.series || []
    const details = body ? `${distancePlot(samples)}${rows([['Sampled minimum distance', `${num(r.summary.minimumDistanceKm)} km`], ['At sampled time', utc(r.summary.minimumUtc)], ['Sampling', `${samples.length} points · ${r.inputs.hours} hours`]])}<p class="notice">A sampled minimum can miss the exact closest instant between samples. These are geometric model positions; this is not a refined conjunction prediction.</p>` : r.runs.map((run, index) => {
      const passes = run.result.passes || (Array.isArray(run.result) ? run.result : []), encounters = run.result.encounters || []
      return `<details ${index === 0 ? 'open' : ''}><summary>Run ${index + 1} · ${utc(run.date)} · ${r.inputs.mode === 'passes' ? `${passes.length} passes` : `${encounters.length} encounters`}</summary><p class="notice">Observer ${num(run.observer?.lat)}, ${num(run.observer?.lon)}; height ${num(run.observer?.height)} km</p>${passes.map(pass => `<div class="info">${rows([['Rise / crossing', utc(pass.rise)], ['Culmination', utc(pass.culmination)], ['Set / crossing', utc(pass.set)], ['Max elevation', `${num(pass.maxElevation)}°`]])}</div>`).join('')}${encounters.map(encounter => `<p>${esc(encounter.name)} · ${num(encounter.distanceKm, 3)} km · ${utc(encounter.utc)}</p>`).join('')}${run.visibilitySamples ? `<details><summary>Sunlight / observer geometry samples</summary><pre class="json-preview">${esc(JSON.stringify(run.visibilitySamples, null, 2))}</pre></details>` : ''}</details>`
    }).join('')
    out.innerHTML = `${details}<details><summary>Reproducible inputs, sources & assumptions</summary><pre class="json-preview">${esc(JSON.stringify({ inputs: r.inputs, assumptions: r.assumptions, summary: r.summary }, null, 2))}</pre></details><label>Study name<input data-name value="${body ? `${esc(r.inputs.a)} ↔ ${esc(r.inputs.b)}` : esc(r.inputs.id)} orbital study" maxlength="120"></label><div class="actions"><button data-save>Save orbital study</button><button data-json>Export orbital JSON</button><button data-csv>Export samples CSV</button></div>`
    $(out, '[data-save]').onclick = () => { try { saveStudy(app, r, $(out, '[data-name]').value) } catch (error) { app.toast(error.message) } }
    $(out, '[data-json]').onclick = () => downloadFile('atlas-orbital-study.json', JSON.stringify(r, null, 2))
    $(out, '[data-csv]').onclick = () => {
      const values = body ? samples : r.runs.flatMap((run, index) => (run.result.passes || run.result.encounters || []).map(row => ({ run: index + 1, start: run.date, observerLat: run.observer?.lat, observerLon: run.observer?.lon, ...row })))
      const columns = [...new Set(values.flatMap(row => Object.keys(row).filter(key => ['string', 'number', 'boolean'].includes(typeof row[key]))))]
      const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"'
      downloadFile('atlas-orbital-samples.csv', columns.map(quote).join(',') + '\n' + values.map(row => columns.map(key => quote(row[key])).join(',')).join('\n'), 'text/csv')
    }
  }
  const offHistory = mountStudyHistory($(el, '[data-history]'), app, { onLoad(run) { if (['body-distance-study', 'orbital-study'].includes(run.method)) { result = run; renderResult() } else app.toast('Use the sky laboratory to reopen this run; the notebook comparison remains available here.') } })
  return () => { active = false; controller?.abort(); offOptions(); offHistory() }
} }
