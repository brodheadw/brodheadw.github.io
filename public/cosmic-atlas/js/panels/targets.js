// Nearby galaxies ranked by IceCube neutrino tracks from their direction (data/targets.json, built by
// mac-studio/build_targets.py). Boötes III stays pinned on top; the rest sort by track count.
import { escapeHTML, separation, shortLy } from '../util.js'

const PINNED = 'Boötes III'

export default {
  id: 'targets',
  title: 'Targets',
  mount(el, atlas) {
    el.innerHTML = '<div class="notice" data-ref="about"></div><ol class="target-list" data-ref="list"></ol>'
    const about = el.querySelector('[data-ref=about]'), list = el.querySelector('[data-ref=list]')
    let alertCounts = new Map(), countedFor = null

    // IceCat-1 alerts whose own 90% error circle contains the target.
    function countAlerts(targets) {
      if (countedFor === atlas.data.neutrinos) return
      countedFor = atlas.data.neutrinos
      alertCounts = new Map(targets.map(t => [t.name, atlas.data.neutrinos.filter(n => Number.isFinite(n.err) && separation(t.ra, t.dec, n.ra, n.dec) <= n.err).length]))
    }

    function render() {
      const doc = atlas.data.targets
      if (!doc) { about.textContent = 'Neutrino counts not published yet.'; return }
      countAlerts(doc.targets)
      about.innerHTML = `IceCube 10-year tracks above ~3 TeV within <b>${doc.radius_deg}°</b> of each galaxy (${doc.events.toLocaleString()} tracks). ` +
        '<b>exp</b> is how many land there by chance at that declination; IceCube collects far more tracks from the southern sky, so compare each count with its own expectation.'
      const rows = [...doc.targets].sort((a, b) => (b.name === PINNED) - (a.name === PINNED) || b.tracks - a.tracks)
      const selected = atlas.selected?.name
      list.innerHTML = rows.map((t, i) => {
        const sig = t.sigma == null ? '' : `<span class="sig ${t.sigma >= 2 ? 'hi' : t.sigma <= -2 ? 'lo' : ''}">${t.sigma > 0 ? '+' : ''}${t.sigma.toFixed(1)}σ</span>`
        const alerts = alertCounts.get(t.name) || 0
        return `<li><button data-i="${i}" class="${t.name === PINNED ? 'pinned' : ''} ${t.name === selected ? 'current' : ''}">
          <span class="t-name">${escapeHTML(t.name)}</span><span class="t-dist">${shortLy(t.mpc)}</span>
          <span class="t-count"><b>${t.tracks}</b> <small>/ ${t.expected} exp</small> ${sig}${alerts ? ` <small class="t-alert">${alerts} alert${alerts > 1 ? 's' : ''}</small>` : ''}</span>
        </button></li>`
      }).join('')
      list.onclick = e => {
        const b = e.target.closest('button[data-i]'); if (!b) return
        const t = rows[+b.dataset.i]
        atlas.align(atlas.findItem(t.name) || atlas.item(t.name, t.ra, t.dec, t.mpc, t.type === 'catalog' ? 'major' : t.type, t.source))
      }
    }
    atlas.on('data', render)
    atlas.on('select', render)
  },
}
