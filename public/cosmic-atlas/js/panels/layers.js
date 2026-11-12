// What is drawn, plus the colour legend.
const LAYERS = [
  ['names', 'Galaxy labels'],
  ['axes', 'Equatorial guides (RA / Dec)'],
  ['sight', 'IceCube neutrino sightlines'],
  ['gamma', 'Fermi gamma-ray sightlines'],
]
const LEGEND = [
  ['#6ebeff', 'Major galaxies'],
  ['#eab6ff', 'Dwarf galaxies / stellar systems'],
  ['#ffcd6f', 'Boötes III (target)'],
  ['#6ef2bd', 'IceCube alert directions'],
  ['#ff788d', 'Fermi gamma-ray directions'],
]

export default {
  id: 'layers',
  title: 'Layers',
  mount(el, atlas) {
    el.innerHTML = LAYERS.map(([k, label]) => `<label class="check"><input type="checkbox" data-layer="${k}">${label}</label>`).join('') +
      LEGEND.map(([c, label]) => `<div class="legend"><span class="dot" style="background:${c}"></span>${label}</div>`).join('')
    el.onchange = e => { const k = e.target.dataset.layer; if (k) atlas.setLayer(k, e.target.checked) }
    const sync = () => el.querySelectorAll('[data-layer]').forEach(i => { i.checked = atlas.state.layers[i.dataset.layer] })
    atlas.on('view', sync)
    sync()
  },
}
