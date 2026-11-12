// Angular cone match of IceCube alerts and Fermi sources around the selected galaxy (Boötes III until something else is picked).
import { download, escapeHTML, separation } from '../util.js'

export default {
  id: 'crossmatch',
  title: 'Cross-catalog match',
  mount(el, atlas) {
    el.innerHTML = `<label>Search radius: <b data-ref="label"></b></label><input data-ref="cone" type="range" min="0.1" max="15" step="0.1" value="2">
      <div class="actions"><button data-ref="export">Export matches CSV</button></div><div class="info" data-ref="out"></div>`
    const ref = n => el.querySelector(`[data-ref=${n}]`)
    let target = null, matches = []

    function run() {
      target = atlas.selected || atlas.data.items.find(x => x.type === 'target') || target
      if (!target) return
      const cone = +ref('cone').value
      ref('label').textContent = cone.toFixed(1) + '°'
      matches = []
      for (const [kind, catalog] of [['IceCube', atlas.data.neutrinos], ['Fermi', atlas.data.fermi]])
        for (const ob of catalog) { const d = separation(target.ra, target.dec, ob.ra, ob.dec); if (d <= cone) matches.push({ ...ob, kind, sep: d }) }
      matches.sort((a, b) => a.sep - b.sep)
      const n = matches.filter(x => x.kind === 'IceCube').length
      ref('out').innerHTML = `<b>${escapeHTML(target.name)}</b> · RA ${target.ra.toFixed(2)}°, Dec ${target.dec.toFixed(2)}°<br>` +
        `<b>${n}</b> IceCube alerts and <b>${matches.length - n}</b> Fermi sources within ${cone.toFixed(1)}°<br>` +
        `<small>Catalogs: ${atlas.data.neutrinos.length} alerts / ${atlas.data.fermi.length.toLocaleString()} gamma-ray sources.</small>` +
        (matches.length ? '<div class="matchlist">' + matches.slice(0, 12).map(o => `<div>${escapeHTML(o.kind)} · ${escapeHTML(o.name)} · ${o.sep.toFixed(3)}°${Number.isFinite(o.energy) ? ' · E=' + o.energy : ''}</div>`).join('') + '</div>' : '') +
        '<div class="notice">Simple cone counts, <b>not</b> background-corrected significances or evidence of dark matter.</div>'
    }
    ref('cone').oninput = run
    ref('export').onclick = () => download((target?.name || 'target').replace(/\W+/g, '_') + '_angular_matches.csv',
      'catalog,name,ra_deg,dec_deg,separation_deg,angular_error_deg,energy\n' +
      matches.map(x => [x.kind, '"' + String(x.name).replaceAll('"', '""') + '"', x.ra, x.dec, x.sep, x.err, x.energy].join(',')).join('\n'))
    atlas.on('data', run)
    atlas.on('select', s => { if (s.kind === 'gal') run() })
  },
}
