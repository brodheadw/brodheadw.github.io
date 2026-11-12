import { $, esc, utc, listen } from '../shell/helpers.js'

export default { title: 'Orbital data · published or local', mount(el, app) {
  el.innerHTML = `<div data-source></div><div class="actions"><button data-import>Load OMM JSON</button><button data-published>Use published snapshot</button><button data-epoch>Clock to element epoch</button></div><input data-file type="file" accept="application/json,.json" hidden><p class="notice">Import a public OMM JSON array, a single OMM record, or an exported snapshot with an objects array (up to 64 MB). Validation and propagation run locally in a worker. Imported elements are not uploaded or described as the complete/current public catalog. Save the original file; a setup records its name/hash and needs it re-imported after reload.</p><div data-feedback role="status"></div>`
  $(el, '[data-import]').onclick = () => $(el, '[data-file]').click()
  $(el, '[data-file]').onchange = async event => {
    const file = event.target.files[0]; if (!file) return
    $(el, '[data-import]').disabled = true; $(el, '[data-feedback]').textContent = 'Validating OMM elements and initializing the orbit worker…'
    try { await app.importSatelliteFile(file); $(el, '[data-feedback]').textContent = 'Validated local elements loaded. Search the catalog to select an object.' }
    catch (error) { $(el, '[data-feedback]').textContent = `Import rejected: ${error.message}. The previous loaded set is retained.` }
    finally { $(el, '[data-import]').disabled = false; event.target.value = '' }
  }
  $(el, '[data-published]').onclick = async event => { event.target.disabled = true; try { await app.usePublishedSatellites(); $(el, '[data-feedback]').textContent = 'Published source selected.' } catch (error) { $(el, '[data-feedback]').textContent = error.message }; event.target.disabled = false }
  $(el, '[data-epoch]').onclick = () => {
    const row = app.store.getState().selection?.layer === 'satellites' ? app.selectionRow() : app.satellites.find(s => s.norad === 25544) || app.satellites[0]
    if (!row) { app.toast('Load orbital elements first.'); return }
    app.store.set({ clock: { utc: new Date(row.epoch).toISOString(), paused: true, rate: 1 } }); app.select('satellites', row.index)
  }
  let previous = ''
  return listen(app, () => {
    const snapshot = app.satelliteSnapshot, source = app.store.getState().satelliteSource
    const key = JSON.stringify([app.satelliteStatus, snapshot, source]); if (key === previous) return; previous = key
    $(el, '[data-epoch]').disabled = !app.satellites.length
    $(el, '[data-source]').innerHTML = `<p class="notice">${esc(app.satelliteStatus || 'The published feed is loaded on demand. Local OMM import is also available.')}</p>${snapshot ? `<details><summary>Loaded snapshot provenance</summary><p>${esc(snapshot.coverage || 'Coverage not stated')}<br>Loaded ${utc(snapshot.fetched_at)}</p><pre class="json-preview">${esc(JSON.stringify(snapshot, null, 2))}</pre></details>` : ''}${source?.kind === 'local' && !app.satellites.length ? `<p class="warning">This setup references local file ${esc(source.name)}. Re-import it to restore the orbital calculations.</p>` : ''}`
  })
} }
