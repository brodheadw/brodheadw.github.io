import test from 'node:test'
import assert from 'node:assert/strict'
import { separation, icrsToGalactic, galacticToIcrs, icrsToSupergalactic, supergalacticToIcrs, skyUV } from '../../js/astro/coords.js'
import { hammerForward, hammerInverse } from '../../js/astro/hammer.js'
import { comovingMpc, lookbackYears } from '../../js/astro/cosmology.js'
import { AU_KM, MPC_LY, auToMpc, mpcToAu, kmToMpc, mpcToKm, lightSeconds, formatDistance } from '../../js/astro/units.js'
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`)

test('separation resolves coincident, antipodal and polar directions', () => {
  near(separation(1, 2, 1, 2), 0, 1e-12)
  near(separation(0, 0, 180, 0), 180, 1e-12)
  near(separation(0, 90, 180, 90), 0, 1e-12)
  near(separation(359, 0, 1, 0), 2, 1e-12)
})

test('ICRS Galactic centre and Galactic/supergalactic round trips', () => {
  // Independently computed with Astropy 8.0.2 on the Studio.
  const bootes = icrsToSupergalactic(209.3, 26.8)
  near(bootes.lon, 93.21092011082807, 1e-5)
  near(bootes.lat, 20.631891664692834, 1e-5)
  const centre = icrsToGalactic(266.405, -28.936)
  near(separation(centre.lon, centre.lat, 0, 0), 0, 0.001)
  for (const [ra, dec] of [[209.3, 26.8], [0, 0], [30, -80], [180, 89]]) {
    const galactic = icrsToGalactic(ra, dec), back = galacticToIcrs(galactic.lon, galactic.lat)
    near(separation(ra, dec, back.ra, back.dec), 0, 1e-10)
    const supergalactic = icrsToSupergalactic(ra, dec), original = supergalacticToIcrs(supergalactic.lon, supergalactic.lat)
    near(separation(ra, dec, original.ra, original.dec), 0, 1e-8)
  }
})

test('Hammer round-trips and rejects coordinates outside the ellipse', () => {
  for (let ra = 1; ra < 360; ra += 13) for (let dec = -89; dec < 90; dec += 11) {
    const point = hammerForward(ra, dec), inverse = hammerInverse(point.x, point.y)
    assert.ok(inverse)
    near(separation(ra, dec, inverse.ra, inverse.dec), 0, 1e-9)
  }
  assert.equal(hammerInverse(3, 2), null)
  assert.ok(hammerForward(209.3, 26.8).x < 0)
  near(skyUV(209.3, 26.8).u, 0.4186111111111111, 1e-12)
  near(skyUV(209.3, 26.8).v, 0.3511111111111111, 1e-12)
})

test('flat LCDM distances and lookback time at z=0.1', () => {
  near(comovingMpc(0.1), 418.4544876, 0.0001)
  near(lookbackYears(0.1) / 1e9, 1.30129756, 0.0001)
  assert.equal(comovingMpc(0), 0)
  assert.ok(Number.isNaN(comovingMpc(-1)))
  assert.ok(Number.isNaN(lookbackYears(-1)))
})

test('unit conversions preserve km and AU at orbit and cosmic scales', () => {
  near(mpcToKm(kmToMpc(400)), 400, 1e-10)
  near(mpcToAu(auToMpc(1)), 1, 1e-12)
  near(lightSeconds(AU_KM), 499.0047838, 1e-6)
  near(MPC_LY, 3261563.777, 0.01)
  assert.match(formatDistance(kmToMpc(400)), /km$/)
})
