import { DEG, galacticToIcrs, supergalacticToIcrs, vectorToRadec, radecToVector } from '../astro/coords.js'
import { palette } from '../palette.js'
const OBLIQUITY_J2000 = 23.439291111 * DEG
// TODO: add a Local Group barycentre only with cited masses, positions and uncertainty.
const identity = (ra, dec) => ({ ra, dec })
const sample = (start, end, step, fn) => Array.from({ length: Math.round((end - start) / step) + 1 }, (_, index) => fn(start + index * step))
const pair = value => [value.ra, value.dec]
let skyGuides
/** Shared immutable ICRS polylines; split at map seams when drawing Hammer coordinates. */
export function getSkyGuides() {
  if (skyGuides) return skyGuides
  const frames = [
    { frame: 'equatorial', label: 'Equatorial', transform: identity, color: palette.grid },
    { frame: 'galactic', label: 'Galactic', transform: galacticToIcrs, color: palette.muted },
    { frame: 'supergalactic', label: 'Supergalactic', transform: supergalacticToIcrs, color: palette.dwarf },
  ]
  const guides = []
  for (const { frame, label, transform, color } of frames) {
    for (const latitude of [-60, -30, 0, 30, 60]) guides.push({
      name: latitude === 0 ? `${label} plane` : `${label} ${latitude > 0 ? '+' : ''}${latitude}°`, frame, kind: 'parallel', latitude, color,
      points: sample(0, 360, 2, longitude => pair(transform(longitude, latitude))),
    })
    for (let longitude = 0; longitude < 360; longitude += 30) guides.push({
      name: `${label} ${longitude}° meridian`, frame, kind: 'meridian', longitude, color,
      points: sample(-90, 90, 2, latitude => pair(transform(longitude, latitude))),
    })
  }
  guides.push({ name: 'Ecliptic plane (J2000)', frame: 'ecliptic', kind: 'plane', color: palette.sun,
    points: sample(0, 360, 2, longitude => {
      const angle = longitude * DEG
      return pair(vectorToRadec([Math.cos(angle), Math.sin(angle) * Math.cos(OBLIQUITY_J2000), Math.sin(angle) * Math.sin(OBLIQUITY_J2000)]))
    }),
  })
  for (const guide of guides) { guide.points.forEach(Object.freeze); Object.freeze(guide.points); Object.freeze(guide) }
  skyGuides = Object.freeze(guides)
  return skyGuides
}
/** Sun-centred schematic disk outline, oriented in the Galactic plane. Distances in Mpc. */
export function milkyWayDisk(radiusMpc = 0.015) {
  if (!Number.isFinite(radiusMpc) || radiusMpc <= 0) throw Error('Disk radius must be positive Mpc')
  return sample(0, 360, 360 / 128, longitude => {
    const point = galacticToIcrs(longitude, 0)
    return radecToVector(point.ra, point.dec, radiusMpc)
  })
}
/** Three great circles per physical distance shell, all Sun-centred in Mpc. */
export function getDistanceShells(radii = [0.1, 1, 10, 100]) {
  return radii.map(radiusMpc => {
    if (!Number.isFinite(radiusMpc) || radiusMpc <= 0) throw Error('Shell radius must be positive Mpc')
    return { radiusMpc, rings: [0, 1, 2].map(axis => sample(0, 360, 360 / 128, angle => {
      const circle = [radiusMpc * Math.cos(angle * DEG), radiusMpc * Math.sin(angle * DEG)]
      return axis === 0 ? [0, ...circle] : axis === 1 ? [circle[0], 0, circle[1]] : [...circle, 0]
    })) }
  })
}
