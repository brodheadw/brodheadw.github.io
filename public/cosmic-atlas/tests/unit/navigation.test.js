import test from 'node:test'
import assert from 'node:assert/strict'
import { panTarget, touchGesture, wheelAction } from '../../js/render/navigation.js'

test('screen pan stays in the camera plane and scales from Earth orbit to cosmic distances', () => {
  for (const distance of [1e-15, 5e-11, .1, 150]) {
    const camera = { target: [0, 0, 0], distance, yaw: .7, pitch: .5 }
    const target = panTarget(camera, 100, 40, 800)
    const sight = [Math.cos(.5) * Math.cos(.7), Math.cos(.5) * Math.sin(.7), Math.sin(.5)]
    assert.ok(Math.abs(target.reduce((sum, value, i) => sum + value * sight[i], 0)) < distance * 1e-14)
    assert.ok(Math.abs(Math.hypot(...target) / distance - Math.hypot(100, 40) * 2 * Math.tan(55 * Math.PI / 360) / 800) < 1e-14)
    const reverse = panTarget({ ...camera, target }, -100, -40, 800)
    assert.ok(Math.hypot(...reverse) < distance * 1e-14)
  }
})

test('two contacts separate translation from pinch, including reciprocal gestures', () => {
  const before = [[10, 20], [110, 20]], moved = [[40, 60], [140, 60]]
  assert.deepEqual(touchGesture(before, moved), { dx: 30, dy: 40, center: [90, 60], zoom: 0 })
  const enlarged = [[-40, 20], [160, 20]], pinch = touchGesture(before, enlarged)
  assert.equal(pinch.dx, 0); assert.equal(pinch.dy, 0)
  assert.ok(Math.abs(pinch.zoom + Math.log(2)) < 1e-14)
  assert.ok(Math.abs(pinch.zoom + touchGesture(enlarged, before).zoom) < 1e-14)
})

test('trackpad scroll pans, pinch or Alt scroll zooms, discrete wheel zooms', () => {
  assert.equal(wheelAction({ deltaMode: 0, deltaY: 15, deltaX: 0 }), 'pan')
  assert.equal(wheelAction({ deltaMode: 0, deltaY: 15, ctrlKey: true }), 'zoom')
  assert.equal(wheelAction({ deltaMode: 0, deltaY: 15, altKey: true }), 'zoom')
  assert.equal(wheelAction({ deltaMode: 1, deltaY: 3 }), 'zoom')
  assert.equal(wheelAction({ deltaMode: 0, deltaY: 100 }), 'zoom')
  assert.equal(wheelAction({ deltaMode: 0, deltaY: 100, shiftKey: true }), 'pan')
})
