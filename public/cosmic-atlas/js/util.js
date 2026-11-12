import { lookbackYears } from './astro/cosmology.js'
export { separation } from './astro/coords.js'
const LY_PER_MPC = 3.261563777e6, AU_PER_MPC = 206264806247.09636, KM_PER_MPC = 3.0856775814913673e19

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 1234567 -> "1.23 million"; small values keep separators. */
export function words(n) {
  const units = [[1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']]
  for (const [v, w] of units) if (n >= v) return Number((n / v).toPrecision(3)).toLocaleString() + ' ' + w
  return Math.round(n).toLocaleString()
}

export function sci(n) {
  if (n === 0) return '0'
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
