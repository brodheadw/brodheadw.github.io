// Sky-map backgrounds, listed from data/overlays/overlays.json (mac-studio/build_overlays.py), grouped by kind.
import { escapeHTML } from '../util.js'

export default {
  id: 'overlays',
  title: 'Sky map overlay',
  mount(el, atlas) {
    el.innerHTML = `<select data-ref="pick" aria-label="Sky map overlay"><option value="none">None</option></select>
      <label>Overlay opacity</label><input data-ref="opacity" type="range" min="0" max="1" step=".05">
      <div class="notice" data-ref="note"></div>`
    const ref = n => el.querySelector(`[data-ref=${n}]`)
    ref('opacity').value = atlas.state.overlayOpacity
    ref('opacity').oninput = e => atlas.setOverlayOpacity(+e.target.value)
    ref('pick').onchange = e => atlas.setOverlay(e.target.value)

    let listed = null
    atlas.on('data', d => {
      if (listed === d.overlays) return
      listed = d.overlays
      const groups = d.overlays.reduce((m, o) => m.set(o.group, [...(m.get(o.group) || []), o]), new Map())
      ref('pick').innerHTML = '<option value="none">None</option>' + [...groups].map(([g, list]) =>
        `<optgroup label="${escapeHTML(g)}">${list.map(o => `<option value="${escapeHTML(o.key)}">${escapeHTML(o.label)}</option>`).join('')}</optgroup>`).join('')
      ref('pick').value = atlas.state.overlayKey
      ref('note').textContent = `${d.overlays.length} skies available. ${atlas.state.overlayNote}`
    })
    atlas.on('overlay', s => { ref('pick').value = s.overlayKey; ref('note').textContent = s.overlayNote })
  },
}
