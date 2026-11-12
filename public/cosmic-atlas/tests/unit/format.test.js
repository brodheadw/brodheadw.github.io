import test from 'node:test'
import assert from 'node:assert/strict'
import { words, distanceUnits, sci } from '../../js/util.js'
test('distance wording retains integer zeroes and handles the observer',()=>{
  assert.equal(words(100e6),'100 million')
  assert.equal(words(10e9),'10 billion')
  assert.equal(sci(0),'0')
  assert.match(distanceUnits(.046).travel,/150,032|150,031|150,030/)
  assert.equal(distanceUnits(0).km,'0 km')
})
