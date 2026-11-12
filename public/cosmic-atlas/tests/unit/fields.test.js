import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { areaWeightedCorrelation, decodeField, loadField, profileFields, sampleField } from '../../js/experiments/fields.js'

const field = (data, width = 4, height = 2, mask = Array(data.length).fill(1)) => ({ width, height, data: Float32Array.from(data), mask: Uint8Array.from(mask) })

test('area-weighted correlation uses common masks and latitude solid angle', () => {
  const a = field([1, 2, 3, 4, 2, 5, 6, 7], 2, 4)
  const b = field(Array.from(a.data, value => value * 3 + 10), 2, 4)
  assert.ok(Math.abs(areaWeightedCorrelation(a, b).r - 1) < 1e-12)
  b.data[0] = -1e6; b.mask[0] = 0
  const result = areaWeightedCorrelation(a, b)
  assert.ok(Math.abs(result.r - 1) < 1e-12)
  const missingFraction = Math.cos(67.5 * Math.PI / 180) / (2 * (2 * Math.cos(67.5 * Math.PI / 180) + 2 * Math.cos(22.5 * Math.PI / 180)))
  assert.ok(Math.abs(result.skyFraction - (1 - missingFraction)) < 1e-12)
  assert.equal(result.count, 7)
  assert.ok(areaWeightedCorrelation(a, b, { excludeMasked: false }).r < 0.99)
  assert.equal(areaWeightedCorrelation(a, field(Array(8).fill(4), 2, 4)).r, null)
  const latitudeTest = areaWeightedCorrelation(field([0, 0, 1, 1, 2, 2, 3, 3], 2, 4), field([0, 0, 2, 2, 1, 1, 5, 5], 2, 4))
  assert.ok(Math.abs(latitudeTest.r - 0.6774036093019867) < 1e-12)
})

test('bilinear profiles wrap RA, obey masks and use a spherical great circle', () => {
  const a = field([10, 20, 30, 40, 10, 20, 30, 40])
  assert.equal(sampleField(a, 315, 45), 10)
  assert.equal(sampleField(a, 0, 45), 25)
  assert.equal(sampleField(a, 360, 45), 25)
  a.mask[0] = 0
  assert.ok(Number.isNaN(sampleField(a, 315, 45)))
  assert.equal(sampleField(a, 315, 45, false), 10)
  const rows = profileFields(a, a, { ra: 209.3, dec: 26.8, radius: 10, samples: 3, excludeMasked: false })
  assert.ok(Math.abs(rows[1].ra - 209.3) < 1e-12)
  assert.ok(Math.abs(rows[1].dec - 26.8) < 1e-12)
  assert.ok(Math.abs(rows[0].dec - rows[2].dec) < 1e-12)
})

test('published grids validate checksums, dimensions, masks and orientation', async () => {
  const fetcher = async url => {
    const raw = await readFile(new URL(`../../${url}`, import.meta.url))
    return { ok: true, json: async () => JSON.parse(raw), arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) }
  }
  const lensing = await loadField('data/fields/lensing.json', { fetcher })
  const density = await loadField('data/fields/density.json', { fetcher })
  assert.equal(lensing.width, 360); assert.equal(lensing.height, 180)
  assert.equal(lensing.data.length, 64800)
  const result = areaWeightedCorrelation(lensing, density)
  assert.ok(result.count > 40000 && result.count < 50000)
  assert.ok(result.skyFraction > 0.6 && result.skyFraction < 0.75)
  assert.ok(Number.isFinite(result.r))
  assert.throws(() => decodeField(lensing.meta, new ArrayBuffer(1), new ArrayBuffer(1)), /byte length/)
  await assert.rejects(loadField('data/fields/lensing.json', { fetcher: async url => {
    const result = await fetcher(url)
    if (url.endsWith('lensing.bin')) result.arrayBuffer = async () => new ArrayBuffer(64800 * 4)
    return result
  } }), /checksum/)
})
