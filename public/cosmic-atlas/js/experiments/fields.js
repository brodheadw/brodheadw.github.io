const radians = Math.PI / 180
const localDataPath = path => typeof path === 'string' && /^data\/[a-z0-9_./-]+$/i.test(path) && !path.split('/').includes('..')

export function validateFieldHeader(header) {
  if (header?.schema !== 1 || header.format !== 'cosmic-atlas-scalar-grid-v1' || header.frame !== 'ICRS' || header.dtype !== 'float32' || header.byteOrder !== 'little') throw Error('Unsupported numeric sky-field format')
  if (![header.width, header.height].every(value => Number.isInteger(value) && value > 1) || header.width * header.height > 10_000_000) throw Error('Invalid numeric sky-field dimensions')
  if (!localDataPath(header.file) || !localDataPath(header.maskFile) || !/^[a-f0-9]{64}$/i.test(header.sha256) || !/^[a-f0-9]{64}$/i.test(header.maskSha256)) throw Error('Invalid sky-field files or checksums')
  if (typeof header.units !== 'string' || !header.units) throw Error('Numeric sky field is missing units')
  if (header.grid?.ra !== '360 - (x + 0.5) / width * 360' || header.grid?.dec !== '90 - (y + 0.5) / height * 180') throw Error('Unknown sky-field pixel convention')
  return header
}

export function decodeField(header, buffer, maskBuffer) {
  validateFieldHeader(header)
  const length = header.width * header.height
  if (buffer.byteLength !== length * 4 || maskBuffer.byteLength !== length) throw Error('Numeric sky-field byte length does not match its header')
  const data = new Float32Array(length), mask = new Uint8Array(maskBuffer), view = new DataView(buffer)
  for (let i = 0; i < length; i++) {
    data[i] = view.getFloat32(i * 4, true)
    if (!Number.isFinite(data[i]) || (mask[i] !== 0 && mask[i] !== 1)) throw Error(`Invalid numeric sky-field pixel ${i}`)
  }
  return { width: header.width, height: header.height, data, mask, meta: header }
}

async function verifyHash(buffer, expected) {
  if (!globalThis.crypto?.subtle) throw Error('Sky-field checksum verification requires HTTPS or localhost')
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  if (Array.from(hash, value => value.toString(16).padStart(2, '0')).join('') !== expected.toLowerCase()) throw Error('Numeric sky-field checksum mismatch')
}

export async function loadField(headerURL, { fetcher = globalThis.fetch } = {}) {
  if (!localDataPath(headerURL)) throw Error('Invalid numeric sky-field header URL')
  async function get(url, type) {
    const response = await fetcher(url)
    if (!response.ok) throw Error(`${url}: HTTP ${response.status}`)
    return response[type]()
  }
  const header = validateFieldHeader(await get(headerURL, 'json'))
  const [buffer, maskBuffer] = await Promise.all([get(header.file, 'arrayBuffer'), get(header.maskFile, 'arrayBuffer')])
  await Promise.all([verifyHash(buffer, header.sha256), verifyHash(maskBuffer, header.maskSha256)])
  return decodeField(header, buffer, maskBuffer)
}

/** Bilinear interpolation never crosses a masked corner; RA wraps across the seam. */
export function sampleField(field, ra, dec, excludeMasked = true) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return NaN
  const { width, height, data, mask } = field
  const x = ((360 - ((ra % 360 + 360) % 360)) % 360) / 360 * width - 0.5
  const y = Math.max(0, Math.min(height - 1, (90 - dec) / 180 * height - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  let value = 0
  for (const [dx, wx] of [[0, 1 - fx], [1, fx]]) for (const [dy, wy] of [[0, 1 - fy], [1, fy]]) {
    const weight = wx * wy
    if (weight < 1e-12) continue
    const index = Math.min(height - 1, y0 + dy) * width + (x0 + dx + width) % width
    if (!Number.isFinite(data[index]) || (excludeMasked && !mask[index])) return NaN
    value += weight * data[index]
  }
  return value
}

/** East–west great-circle cut. Positive offset follows increasing RA at the centre. */
export function profileFields(lensing, density, { ra, dec, radius = 15, samples = 81, excludeMasked = true }) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90 || !Number.isFinite(radius) || radius <= 0 || radius > 180 || !Number.isInteger(samples) || samples < 3 || samples > 1001) throw Error('Invalid numeric profile direction or sampling')
  const a = ra * radians, d = dec * radians
  const centre = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
  const east = [-Math.sin(a), Math.cos(a), 0]
  return Array.from({ length: samples }, (_, i) => {
    const offset = -radius + 2 * radius * i / (samples - 1), angle = offset * radians
    const point = centre.map((value, axis) => value * Math.cos(angle) + east[axis] * Math.sin(angle))
    const sampleRA = (Math.atan2(point[1], point[0]) / radians + 360) % 360
    const sampleDec = Math.asin(Math.max(-1, Math.min(1, point[2]))) / radians
    return { offset, ra: sampleRA, dec: sampleDec, lensing: sampleField(lensing, sampleRA, sampleDec, excludeMasked), density: sampleField(density, sampleRA, sampleDec, excludeMasked) }
  })
}

/** cos(Dec) is proportional to exact pixel solid angle on this regular latitude grid. */
export function areaWeightedCorrelation(first, second, { excludeMasked = true } = {}) {
  if (first.width !== second.width || first.height !== second.height || first.data.length !== second.data.length) throw Error('Correlation fields must share a grid')
  const { width, height } = first
  let count = 0, totalWeight = 0, weight = 0, sumX = 0, sumY = 0
  for (let y = 0; y < height; y++) {
    const area = Math.cos((90 - (y + 0.5) / height * 180) * radians)
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      totalWeight += area
      if (!Number.isFinite(first.data[i]) || !Number.isFinite(second.data[i]) || (excludeMasked && (!first.mask[i] || !second.mask[i]))) continue
      count++; weight += area; sumX += area * first.data[i]; sumY += area * second.data[i]
    }
  }
  if (!count) return { r: null, count: 0, skyFraction: 0, meanX: null, meanY: null, excludeMasked }
  const meanX = sumX / weight, meanY = sumY / weight
  let xx = 0, yy = 0, xy = 0
  for (let y = 0; y < height; y++) {
    const area = Math.cos((90 - (y + 0.5) / height * 180) * radians)
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!Number.isFinite(first.data[i]) || !Number.isFinite(second.data[i]) || (excludeMasked && (!first.mask[i] || !second.mask[i]))) continue
      const dx = first.data[i] - meanX, dy = second.data[i] - meanY
      xx += area * dx * dx; yy += area * dy * dy; xy += area * dx * dy
    }
  }
  return { r: xx > 0 && yy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null, count, skyFraction: weight / totalWeight, meanX, meanY, excludeMasked }
}
