import test from 'node:test'
import assert from 'node:assert/strict'
import { getSkyGuides, milkyWayDisk, getDistanceShells } from '../../js/render/guides.js'
import { separation, vectorToRadec, icrsToGalactic } from '../../js/astro/coords.js'

test('reference guides cover three coordinate frames and the true Galactic centre', () => {
  const guides = getSkyGuides()
  for (const frame of ['equatorial', 'galactic', 'supergalactic']) {
    assert.equal(guides.filter(guide => guide.frame === frame && guide.kind === 'parallel').length, 5)
    assert.equal(guides.filter(guide => guide.frame === frame && guide.kind === 'meridian').length, 12)
  }
  const plane = guides.find(guide => guide.name === 'Galactic plane')
  assert.ok(separation(...plane.points[0], 266.405, -28.936) < 0.001)
  assert.ok(Object.isFrozen(guides))
  assert.ok(Object.isFrozen(plane.points[0]))
})

test('ecliptic reference plane uses J2000 obliquity and vernal equinox', () => {
  const ecliptic = getSkyGuides().find(guide => guide.frame === 'ecliptic')
  assert.ok(separation(...ecliptic.points[0], 0, 0) < 1e-10)
  assert.ok(separation(...ecliptic.points[45], 90, 23.439291111) < 1e-10)
})

test('Milky Way disk and distance shells retain physical orientation and radii', () => {
  for (const vector of milkyWayDisk()) {
    assert.ok(Math.abs(Math.hypot(...vector) - 0.015) < 1e-12)
    const { ra, dec } = vectorToRadec(vector)
    assert.ok(Math.abs(icrsToGalactic(ra, dec).lat) < 1e-10)
  }
  for (const shell of getDistanceShells()) for (const ring of shell.rings) for (const vector of ring) assert.ok(Math.abs(Math.hypot(...vector) - shell.radiusMpc) < 1e-10)
  assert.throws(() => milkyWayDisk(-1))
})
