import { $, esc, num, listen, utc } from '../shell/helpers.js'

export default { title: 'Tracked Solar System', mount(el, app) {
  el.innerHTML = `<label>Find a body<input data-search type="search" placeholder="Planet, moon, comet or asteroid…"></label><label class="check"><input data-small type="checkbox">Include the JPL small-body set</label><div data-status class="notice"></div><div data-bodies class="search-results"></div><p class="notice">Physical radii and positions stay to scale. Hollow diamonds and leader lines locate bodies that are smaller than a pixel or share an apparent position. The eight sampled small bodies are a selected set, not a complete inventory of the Solar System.</p>`
  let signature = ''
  function render() {
    const query = $(el, '[data-search]').value.toLowerCase(), state = app.store.getState(), coverage = app.smallBodyStatus
    $(el, '[data-small]').checked = !!state.layers.smallbodies?.visible
    const key = JSON.stringify([query, app.bodies.map(b => b.id), state.layers.smallbodies?.visible, coverage])
    if (key === signature) return; signature = key
    $(el, '[data-status]').textContent = coverage?.loading ? 'Loading JPL sampled vectors…' : coverage?.error ? coverage.error : coverage?.available ? `${coverage.count} sampled small bodies · ${utc(coverage.start)} through ${utc(coverage.end)}. No extrapolation.` : 'Planets and supported moons use Astronomy Engine. Enable the JPL set to load its stated vector coverage.'
    $(el, '[data-bodies]').innerHTML = app.bodies.filter(body => `${body.name} ${body.kind || ''}`.toLowerCase().includes(query)).map(body => `<button data-body="${esc(body.id)}">${esc(body.name)}<small>${esc(body.kind || (body.parent === 'sun' ? 'Solar body' : 'Moon'))} · ${num(body.heliocentricDistanceKm / 149597870.7, 4)} AU</small></button>`).join('') || '<p class="empty">No matching body at this clock time. Check sampled-vector coverage.</p>'
    el.querySelectorAll('[data-body]').forEach(button => { button.onclick = () => app.select('solar', button.dataset.body) })
  }
  $(el, '[data-search]').oninput = render
  $(el, '[data-small]').onchange = e => { app.store.set({ layers: { smallbodies: { visible: e.target.checked, opacity: 1, filters: {} } } }); if (e.target.checked) app.loadLayer('smallbodies') }
  return listen(app, render)
} }
