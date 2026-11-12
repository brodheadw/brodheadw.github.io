const radians = Math.PI / 180
/** Camera-plane displacement in physical Mpc, independent of the current scale. */
export function panTarget(camera, dx, dy, viewportHeight, fov = 55) {
  const { yaw, pitch, distance, target } = camera
  const right = [-Math.sin(yaw), Math.cos(yaw), 0]
  const up = [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)]
  const step = 2 * distance * Math.tan(fov * radians / 2) / Math.max(1, viewportHeight)
  return target.map((value, k) => value + (-dx * right[k] + dy * up[k]) * step)
}
/** Compare the same two contacts before/after an event: centroid motion plus pinch. */
export function touchGesture(before, after) {
  const center = points => [0, 1].map(k => (points[0][k] + points[1][k]) / 2)
  const a = center(before), b = center(after)
  const distance = points => Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])
  const oldDistance = distance(before), newDistance = distance(after)
  return { dx: b[0] - a[0], dy: b[1] - a[1], center: b, zoom: oldDistance > 1 && newDistance > 1 ? Math.log(oldDistance / newDistance) : 0 }
}
/** Browsers report trackpad scrolling in pixels and pinch as Ctrl+wheel. */
export function wheelAction(event) {
  if (event.ctrlKey || event.altKey) return 'zoom'
  return event.shiftKey || event.deltaX || (event.deltaMode === 0 && Math.abs(event.deltaY) < 80) ? 'pan' : 'zoom'
}
