export const $ = id => document.getElementById(id)
export const rad = Math.PI / 180

export function xyz(ra, dec, r) {
  const a = ra * rad, d = dec * rad
  return [r * Math.cos(d) * Math.cos(a), r * Math.cos(d) * Math.sin(a), r * Math.sin(d)]
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** Angular separation in degrees. */
export function separation(ra1, dec1, ra2, dec2) {
  const a = dec1 * rad, b = dec2 * rad, d = (ra1 - ra2) * rad
  return Math.acos(Math.max(-1, Math.min(1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(d)))) / rad
}

export function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' })), a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Flat ΛCDM, H0=70 km/s/Mpc, Ωm=0.3. Simpson's rule over 1/E(z).
const H0 = 70, OM = 0.3, C_KMS = 299792.458
function integrate(z, f) {
  const N = 64, h = z / N
  let sum = 0
  for (let i = 0; i <= N; i++) sum += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * f(i * h)
  return h * sum / 3
}
const E = q => Math.sqrt(OM * (1 + q) ** 3 + 1 - OM)

/** Comoving radial distance in Mpc. */
export function comovingMpc(z) {
  if (!Number.isFinite(z) || z < 0 || z > 8) return NaN
  return C_KMS / H0 * integrate(z, q => 1 / E(q))
}

/** Lookback time in years: how long the light has been travelling. */
export function lookbackYears(z) {
  const hubbleTimeYears = 977.8e9 / H0 // 1/H0 in years
  return hubbleTimeYears * integrate(z, q => 1 / ((1 + q) * E(q)))
}

const LY_PER_MPC = 3.26156e6, AU_PER_MPC = 2.06265e11, KM_PER_MPC = 3.08568e19

/** 1234567 -> "1.23 million"; small values keep separators. */
export function words(n) {
  const units = [[1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']]
  for (const [v, w] of units) if (n >= v) return (n / v).toPrecision(3).replace(/\.?0+$/, '') + ' ' + w
  return Math.round(n).toLocaleString()
}

export function sci(n) {
  const e = Math.floor(Math.log10(n)), m = n / 10 ** e
  return m.toFixed(2) + ' × 10<sup>' + e + '</sup>'
}

/** Every useful unit for a distance in Mpc; z (if known) gives the true light-travel time. */
export function distanceUnits(mpc, z) {
  const ly = mpc * LY_PER_MPC
  const travel = Number.isFinite(z) && z > 0.003 ? lookbackYears(z) : ly
  return {
    parsec: mpc < 0.1 ? (mpc * 1000).toFixed(1) + ' kpc' : mpc < 100 ? mpc.toFixed(3) + ' Mpc' : mpc.toFixed(1) + ' Mpc',
    ly: words(ly) + ' light years',
    au: words(mpc * AU_PER_MPC) + ' AU',
    km: sci(mpc * KM_PER_MPC) + ' km',
    travel: words(travel) + ' years',
  }
}

/** Short form for lists: "150 thousand ly". */
export function shortLy(mpc) {
  const ly = mpc * LY_PER_MPC
  if (ly >= 1e9) return (ly / 1e9).toFixed(2) + ' Gly'
  if (ly >= 1e6) return (ly / 1e6).toFixed(2) + ' Mly'
  return Math.round(ly / 1000).toLocaleString() + 'k ly'
}

export function parseCSV(t) {
  const lines = t.replace(/^﻿/, '').trim().split(/\r?\n/).filter(x => x.trim() && !x.trim().startsWith('#'))
  if (lines.length < 2) throw Error('CSV needs header + rows')
  const split = l => {
    const out = []
    let cur = '', quoted = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (ch === '"') { if (quoted && l[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted }
      else if ((ch === ',' || ch === '\t') && !quoted) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const hdr = split(lines.shift()).map(s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const ix = (...names) => hdr.findIndex(k => names.includes(k))
  const iRA = ix('ra_deg', 'ra', 'raj2000', 'right_ascension', 'ra_icrs'), iDec = ix('dec_deg', 'dec', 'dej2000', 'declination', 'dec_icrs')
  const iName = ix('name', 'object', 'id', 'source', 'source_name', 'targetid'), iM = ix('distance_mpc', 'dist_mpc', 'distance')
  const iK = ix('distance_kpc', 'dist_kpc'), iZ = ix('z', 'redshift', 'z_spec'), iErr = ix('angular_error_deg', 'sigma_deg', 'ang_err', 'angerr', 'sigma')
  const iE = ix('energy_gev', 'energy', 'log10_energy', 'log10e'), iWarn = ix('zwarn'), iCls = ix('class'), iAs = ix('association')
  if (iRA < 0 || iDec < 0) throw Error('Missing RA or Dec columns')
  return lines.map((l, j) => {
    const c = split(l), val = i => i < 0 ? '' : c[i]
    const z = +val(iZ)
    const dist = iK >= 0 ? +val(iK) / 1000 : iM >= 0 ? +val(iM) : iZ >= 0 ? comovingMpc(z) : NaN
    return {
      name: val(iName) || 'Object ' + (j + 1), ra: +val(iRA), dec: +val(iDec), mpc: dist, z: iZ >= 0 ? z : NaN,
      err: iErr >= 0 ? +val(iErr) : NaN, energy: iE >= 0 ? +val(iE) : NaN, zwarn: iWarn >= 0 ? +val(iWarn) : NaN,
      cls: val(iCls), assoc: val(iAs),
    }
  }).filter(x => Number.isFinite(x.ra) && Number.isFinite(x.dec))
}
