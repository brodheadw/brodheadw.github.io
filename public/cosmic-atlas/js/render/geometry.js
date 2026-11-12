const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)
export function segmentBlockedBySphere(a, b, center, radius, endpointTolerance = 1e-6) {
  const delta = b.map((v, i) => v - a[i]), offset = center.map((v, i) => v - a[i]), denominator = dot(delta, delta)
  if (!denominator) return false
  const t = dot(offset, delta) / denominator
  if (t <= endpointTolerance || t >= 1 - endpointTolerance) return false
  return Math.hypot(...a.map((v, i) => v + delta[i] * t - center[i])) < radius
}

export function scaleRuler(distanceMpc, viewportHeight, maxPixels = 115, fovDegrees = 55) {
  const mpcPerPixel = distanceMpc * 2 * Math.tan(fovDegrees * Math.PI / 360) / viewportHeight
  const maximum = mpcPerPixel * maxPixels, power = 10 ** Math.floor(Math.log10(maximum)), fraction = maximum / power
  const mpc = (fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1) * power
  return { mpc, pixels: mpc / mpcPerPixel }
}
