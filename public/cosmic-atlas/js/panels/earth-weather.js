import { $, esc, utc, listen } from '../shell/helpers.js'

export default { title: 'Earth weather · observed cloud fraction', mount(el, app) {
  el.innerHTML = `<label class="check"><input data-show type="checkbox">Show observed cloud-fraction layer</label><label>Weather overlay opacity<input data-opacity type="range" min="0" max="1" step=".05"></label><div data-status></div><div class="actions"><button data-refresh>Check published weather snapshot</button></div><p class="notice">Lower opacity blends the product colors with Earth; use full opacity to compare colors with the legend. This is a dated satellite observation product. It does not advance with the simulation clock and is not a forecast of clouds during future passes.</p>`
  let key = ''
  const update = patch => app.store.set({ layers: { 'weather.clouds': { visible: false, opacity: .65, filters: {}, ...app.store.getState().layers['weather.clouds'], ...patch } } })
  $(el, '[data-show]').onchange = e => { update({ visible: e.target.checked }); if (e.target.checked) app.loadLayer('weather.clouds') }
  $(el, '[data-opacity]').oninput = e => update({ opacity: +e.target.value })
  $(el, '[data-refresh]').onclick = async e => { e.target.disabled = true; try { await app.loadWeatherData() } catch (error) { app.toast(error.message) }; e.target.disabled = false }
  return listen(app, () => {
    const layer = app.store.getState().layers['weather.clouds'], data = app.weatherStatus
    $(el, '[data-show]').checked = !!layer?.visible; $(el, '[data-opacity]').value = layer?.opacity ?? .65
    const next = `${JSON.stringify(data)}:${Math.floor(Date.now() / 3600000)}`; if (next === key) return; key = next
    const out = $(el, '[data-status]')
    if (!data?.available) { out.innerHTML = `<p class="empty">${esc(data?.error || 'Enable the layer to load its observation date and coverage.')}</p>`; return }
    const ageHours = (Date.now() - Date.parse(data.observation_end || data.observation_date)) / 3600000, stale = !Number.isFinite(ageHours) || ageHours > (data.stale_after_hours || 48)
    out.innerHTML = `<div class="info"><span class="badge">OBSERVED · ${stale ? 'STALE SNAPSHOT' : 'DATED CLOUD PRODUCT'}</span><h3>${esc(data.product || 'Cloud fraction')}</h3><p>Nominal observation day: <strong>${esc(data.observation_date || '')}</strong><br>Retrieved ${utc(data.fetched_at)}</p><p>${esc(data.description || '')}</p>${(typeof data.legend === 'string' ? data.legend : data.legend?.file) || data.legend_file ? `<img class="weather-legend" src="${esc((typeof data.legend === 'string' ? data.legend : data.legend?.file) || data.legend_file)}" alt="Official observed cloud fraction legend, zero to one hundred percent">` : '<p class="notice">Official product colors represent cloud fraction from 0–100%; transparent areas have no data.</p>'}<p class="notice">${esc(data.coverage || '')}<br>${esc(data.caveat || '')}</p>${stale ? `<p class="warning">This observation is older than ${data.stale_after_hours || 48} hours. Do not treat it as current weather.</p>` : ''}${data.displayError ? `<p class="error">${esc(data.displayError)}</p>` : ''}<details><summary>Observation provenance & processing</summary><pre class="json-preview">${esc(JSON.stringify(data, null, 2))}</pre></details></div>`
  })
} }
