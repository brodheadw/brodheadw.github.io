import { escapeHTML } from '../util.js'
import { palette } from '../palette.js'
import { areaWeightedCorrelation, loadField, profileFields } from '../experiments/fields.js'

function pathFor(profile, key, lo, hi, width, height) {
  let penDown = false
  return profile.map((row, i) => {
    if (!Number.isFinite(row[key])) { penDown = false; return '' }
    const x = 34 + i / (profile.length - 1) * (width - 68), y = 25 + (1 - (row[key] - lo) / (hi - lo || 1)) * (height - 62)
    const command = penDown ? 'L' : 'M'; penDown = true
    return `${command}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function profileSVG(profile, radius) {
  const width = 400, height = 200
  const ranges = ['lensing', 'density'].map(key => {
    const values = profile.map(row => row[key]).filter(Number.isFinite)
    const lo = values.length ? Math.min(...values) : 0, hi = values.length ? Math.max(...values) : 1
    return { key, lo, hi: hi === lo ? lo + 1 : hi, color: key === 'lensing' ? palette.target : palette.major }
  })
  const legend = ranges.map((range, i) => `<text x="${i ? width - 34 : 34}" y="14" text-anchor="${i ? 'end' : 'start'}" fill="${range.color}">${i ? 'Galaxy density' : 'κ convergence'}</text>`).join('')
  const labels = ranges.map((range, i) => [range.hi, range.lo].map((value, j) => `<text x="${i ? width - 3 : 3}" y="${j ? height - 34 : 37}" text-anchor="${i ? 'end' : 'start'}" fill="${range.color}">${value.toPrecision(2)}</text>`).join('')).join('')
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="East–west great-circle profile. Gold is lensing convergence, blue is galaxy density, each with its own vertical scale." style="width:100%;font:10px var(--font-mono, monospace)">
    <rect x="34" y="25" width="${width - 68}" height="${height - 62}" fill="none" stroke="${palette.edge}"/>
    <path d="M${width / 2},25V${height - 37}" stroke="${palette.grid}"/>
    ${legend}${labels}${ranges.map(range => `<path d="${pathFor(profile, range.key, range.lo, range.hi, width, height)}" fill="none" stroke="${range.color}" stroke-width="1.8"/>`).join('')}
    <text x="34" y="${height - 18}" fill="${palette.muted}">−${radius}° west</text><text x="${width / 2}" y="${height - 18}" text-anchor="middle" fill="${palette.muted}">centre</text><text x="${width - 34}" y="${height - 18}" text-anchor="end" fill="${palette.muted}">+${radius}° east</text>
  </svg>`
}

export default {
  id: 'darkmatter',
  title: 'Projected mass & structure',
  mount(el, app) {
    el.innerHTML = `<p class="notice">CMB lensing convergence κ measures projected mass along the line of sight. It is dimensionless and is not a 3D dark-matter map.</p>
      <div class="actions"><label>RA (degrees)<input data-field="ra" type="number" min="0" max="360" step="0.1" value="209.3"></label><label>Dec (degrees)<input data-field="dec" type="number" min="-90" max="90" step="0.1" value="26.8"></label></div>
      <label>Profile half-width (degrees)<input data-field="radius" type="number" min="1" max="90" step="1" value="15"></label>
      <label><input data-field="mask" type="checkbox" checked> Exclude masked pixels from profile and correlation</label>
      <div class="actions"><button data-action="selection">Use selected direction</button><button data-action="profile">Update profile</button></div>
      <div data-output="status" role="status" aria-live="polite">Loading numeric fields and validating checksums…</div><div data-output="plot"></div><div data-output="correlation" class="notice"></div>
      <p class="notice">East–west great-circle cut; each curve has its own vertical scale. Gold: dimensionless κ (1.5° smoothing). Blue: galaxies per HEALPix nside=128 pixel (3° smoothing). Samples use bilinear interpolation on 1° ICRS pixels; gaps are excluded mask pixels. This control affects these statistics only.</p>
      <p class="notice">Galaxy counts are unweighted and are not corrected for distance selection or Galactic-plane incompleteness. The descriptive correlation has no significance or cosmological fit; the smoothing scales differ. Display sky images are for orientation, not photometry.</p>
      <p class="notice">3D reconstruction TODO: no public volume source with verified coordinate system, normalization and redistribution terms has been added. Projected maps are never extruded into a fabricated volume.</p><div data-output="sources"></div>`
    const field = name => el.querySelector(`[data-field="${name}"]`)
    const output = name => el.querySelector(`[data-output="${name}"]`)
    let lensing, density, disposed = false, selectionKey

    function render() {
      if (!lensing || !density || disposed) return
      try {
        const ra = Number(field('ra').value), dec = Number(field('dec').value), radius = Number(field('radius').value), excludeMasked = field('mask').checked
        if (!field('ra').value || !field('dec').value || !field('radius').value || ra < 0 || ra > 360 || radius < 1 || radius > 90) throw Error('Enter RA 0–360°, Dec −90–90° and half-width 1–90°.')
        const profile = profileFields(lensing, density, { ra, dec, radius, excludeMasked })
        const correlation = areaWeightedCorrelation(lensing, density, { excludeMasked })
        output('plot').innerHTML = profileSVG(profile, radius)
        output('status').textContent = `ICRS centre RA ${ra.toFixed(2)}°, Dec ${dec.toFixed(2)}° · ${profile.length} samples · ${profile.filter(row => Number.isFinite(row.lensing) && Number.isFinite(row.density)).length} valid pairs`
        output('correlation').textContent = correlation.r === null ? 'No common valid variation to correlate.' : `Full-sky area-weighted Pearson r = ${correlation.r.toFixed(4)} · ${correlation.count.toLocaleString()} common pixels · ${(100 * correlation.skyFraction).toFixed(1)}% of sky area. ${excludeMasked ? 'Both release masks applied.' : 'Masked pixels included for diagnostics; values there may be unreliable.'}`
      } catch (error) { output('status').textContent = error.message }
    }
    function useSelection() {
      const row = app.selectionRow?.()
      if (!Number.isFinite(row?.ra) || !Number.isFinite(row?.dec)) return
      field('ra').value = row.ra.toFixed(3); field('dec').value = row.dec.toFixed(3)
      render()
    }
    el.querySelector('[data-action="profile"]').onclick = render
    el.querySelector('[data-action="selection"]').onclick = useSelection
    field('mask').onchange = render
    for (const name of ['ra', 'dec', 'radius']) field(name).onchange = render
    const unsubscribe = app.subscribe?.(() => {
      const row = app.selectionRow?.(), key = row && `${row.ra},${row.dec}`
      if (key !== selectionKey) { selectionKey = key; useSelection() }
    })
    const layers = ['sky.lensing', 'sky.lss'].map(id => app.registry.find(layer => layer.id === id))
    if (layers.some(layer => !layer?.files.field)) output('status').textContent = 'Numeric projected fields are unavailable. Run the Mac Studio pipeline with --fields; sky images remain viewable.'
    else Promise.all(layers.map(layer => loadField(layer.files.field))).then(fields => {
      if (disposed) return
      ;[lensing, density] = fields
      output('sources').innerHTML = fields.map((value, i) => `<p><a href="${escapeHTML(layers[i].citation.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(layers[i].citation.title)}</a><br><small>${escapeHTML(value.meta.processing)}<br>Data version ${escapeHTML(value.meta.version)} · ${escapeHTML(value.meta.license)}</small></p>`).join('')
      useSelection(); render()
    }).catch(error => { if (!disposed) output('status').textContent = `Numeric field unavailable: ${error.message}` })
    return () => { disposed = true; unsubscribe?.() }
  },
}
