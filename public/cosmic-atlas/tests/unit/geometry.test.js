import test from 'node:test'
import assert from 'node:assert/strict'
import { segmentBlockedBySphere, scaleRuler } from '../../js/render/geometry.js'
test('occultation ignores endpoint bodies and detects an intervening body',()=>{
  assert.equal(segmentBlockedBySphere([-2,0,0],[2,0,0],[0,0,0],1),true)
  assert.equal(segmentBlockedBySphere([-2,2,0],[2,2,0],[0,0,0],1),false)
  assert.equal(segmentBlockedBySphere([0,0,0],[2,0,0],[0,0,0],1),false)
  assert.equal(segmentBlockedBySphere([0,0,0],[2,0,0],[2,0,0],1),false)
})

test('scale ruler matches the perspective projection at orbit and cosmic scales',()=>{
  for (const distance of [100/3.0856775814913673e19, .046, 400]) {
    const ruler = scaleRuler(distance, 800)
    assert.ok(ruler.pixels > 0 && ruler.pixels <= 115)
    assert.ok(Math.abs(ruler.mpc / (distance * 2 * Math.tan(55*Math.PI/360)) * 800-ruler.pixels)<1e-10)
  }
})
