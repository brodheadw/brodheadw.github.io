import { DEG, wrapDegrees } from './coords.js'
/** Hammer map, x in ±2√2, y in ±√2. RA increases towards the left. */
export function hammerForward(ra, dec, centre = 180) {
  const longitude = ((centre - ra + 540) % 360 - 180) * DEG, latitude = dec * DEG
  const divisor = Math.sqrt(1 + Math.cos(latitude) * Math.cos(longitude / 2))
  return { x: 2 * Math.SQRT2 * Math.cos(latitude) * Math.sin(longitude / 2) / divisor, y: Math.SQRT2 * Math.sin(latitude) / divisor }
}
export function hammerInverse(x, y, centre = 180) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x * x / 8 + y * y / 2 > 1 + 1e-12) return null
  const z = Math.sqrt(Math.max(0, 1 - x * x / 16 - y * y / 4))
  const longitude = 2 * Math.atan2(z * x, 2 * (2 * z * z - 1))
  return { ra: wrapDegrees(centre - longitude / DEG), dec: Math.asin(Math.max(-1, Math.min(1, z * y))) / DEG }
}
export const hammer = hammerForward
export const inverseHammer = hammerInverse
