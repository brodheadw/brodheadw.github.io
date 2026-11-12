// Camera shortcuts, visible radius and name search.
import { shortLy } from '../util.js'

// The radius slider is logarithmic: 0.05 Mpc (the Milky Way's satellites) to 2000 Mpc (2MRS depth).
const MIN = Math.log10(.05), MAX = Math.log10(2000)
const toSlider = r => (Math.log10(r) - MIN) / (MAX - MIN) * 1000
const fromSlider = v => 10 ** (MIN + v / 1000 * (MAX - MIN))

export default {
  id: 'navigate',
  title: 'Navigate',
  mount(el, atlas) {
    el.innerHTML = `<div class="actions"><button data-ref="reset">Reset view</button><button data-ref="m31">Andromeda</button><button data-ref="lmc">LMC</button></div>
      <label>Visible radius: <b data-ref="label"></b></label><input data-ref="range" type="range" min="0" max="1000" step="1">
      <label>Find a galaxy</label><input data-ref="search" type="text" placeholder="Try Andromeda, Draco, Boötes…">`
    const ref = n => el.querySelector(`[data-ref=${n}]`)
    const go = prefix => { const ob = [...atlas.data.items, ...atlas.data.imported].find(x => x.name.startsWith(prefix)); if (ob) atlas.align(ob) }
    ref('reset').onclick = () => atlas.resetView()
    ref('m31').onclick = () => go('Andromeda')
    ref('lmc').onclick = () => go('Large Magellanic')
    ref('range').oninput = e => atlas.setRadius(fromSlider(+e.target.value))
    ref('search').oninput = e => {
      const v = e.target.value.trim().toLowerCase()
      if (v.length < 2) return
      const ob = [...atlas.data.items, ...atlas.data.imported].find(x => x.name.toLowerCase().includes(v))
      if (ob) atlas.select(ob)
    }
    const sync = () => {
      const r = atlas.state.radius
      ref('range').value = toSlider(r)
      ref('label').textContent = (r < 1 ? (r * 1000).toFixed(0) + ' kpc' : r.toFixed(r < 10 ? 2 : 0) + ' Mpc') + ' · ' + shortLy(r)
    }
    atlas.on('view', sync)
    sync()
  },
}
