// Details of whatever was last clicked: a galaxy (with its distance in every unit), a neutrino alert or a gamma-ray source.
import { distanceUnits, escapeHTML } from '../util.js'

const BADGE = { target: 'TARGET · dwarf candidate', major: 'GALAXY', dwarf: 'DWARF / STELLAR SYSTEM', catalog: 'GALAXY' }

function galaxy(ob, atlas) {
  const u = distanceUnits(ob.r, ob.z)
  const t = atlas.data.targets?.targets.find(x => x.name === ob.name)
  return `<span class="badge">${BADGE[ob.type] || 'GALAXY'}</span><br><b>${escapeHTML(ob.name)}</b>
    <table class="units">
      <tr><th>Distance</th><td>${u.parsec}</td></tr>
      <tr><th>Light years</th><td>${u.ly}</td></tr>
      <tr><th>AU</th><td>${u.au}</td></tr>
      <tr><th>Kilometres</th><td>${u.km}</td></tr>
      <tr><th>Light left it</th><td>${u.travel} ago</td></tr>
      ${Number.isFinite(ob.z) ? `<tr><th>Redshift</th><td>z = ${ob.z.toFixed(4)}</td></tr>` : ''}
      <tr><th>RA / Dec</th><td>${ob.ra.toFixed(3)}° / ${ob.dec.toFixed(3)}°</td></tr>
      ${t ? `<tr><th>IceCube tracks</th><td>${t.tracks} within ${atlas.data.targets.radius_deg}° (${t.expected} expected)</td></tr>` : ''}
    </table><small>${escapeHTML(ob.source)}${Number.isFinite(ob.z) && ob.z > .003 ? ' · light-travel time from redshift (flat ΛCDM)' : ''}</small>`
}

function neutrino(o) {
  return `<span class="badge">ICECUBE NEUTRINO ALERT</span><br><b>${escapeHTML(o.name)}</b><br>RA ${o.ra.toFixed(2)}° · Dec ${o.dec.toFixed(2)}°<br>` +
    `Direction uncertainty: ${Number.isFinite(o.err) ? o.err.toFixed(2) + '° (90%)' : 'n/a'}<br>Energy: ${Number.isFinite(o.energy) ? (o.energy / 1000).toFixed(0) + ' TeV' : 'n/a'}` +
    '<br><small>A direction only: neutrinos carry no distance.</small>'
}

function fermi(o) {
  return `<span class="badge">FERMI GAMMA-RAY SOURCE</span><br><b>${escapeHTML(o.name)}</b><br>RA ${o.ra.toFixed(2)}° · Dec ${o.dec.toFixed(2)}°<br>` +
    `Class: ${escapeHTML(o.cls || 'unassociated')}${o.assoc ? '<br>Counterpart: ' + escapeHTML(o.assoc) : ''}`
}

export default {
  id: 'selected',
  title: 'Selected object',
  mount(el, atlas) {
    el.innerHTML = '<div class="info">Click a galaxy or pick a target to see its distance and coordinates.</div>'
    const info = el.firstElementChild
    let last = null
    const render = () => { if (last) info.innerHTML = last.kind === 'nu' ? neutrino(last.ob) : last.kind === 'fermi' ? fermi(last.ob) : galaxy(last.ob, atlas) }
    atlas.on('select', s => { last = s; render() })
    atlas.on('data', render)
  },
}
