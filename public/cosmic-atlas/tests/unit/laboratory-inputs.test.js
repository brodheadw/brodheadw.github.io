import test from 'node:test'
import assert from 'node:assert/strict'
import { numberList } from '../../js/panels/laboratory.js'
import { observerList } from '../../js/panels/orbit-study.js'
import { num } from '../../js/shell/helpers.js'

test('study lists validate boundaries, retain zero, sort and deduplicate', () => {
  assert.deepEqual(numberList('3, 0, 1, 1', { min: 0, max: 4 }), [0, 1, 3])
  for (const text of ['', '1,,2', 'NaN', '-1', '5']) assert.throws(() => numberList(text, { min: 0, max: 4 }))
})
test('study observer parser aligns the orbital model limits and uses current observer when blank', () => {
  const observer = { lat: 40, lon: -74, height: 0 }
  assert.deepEqual(observerList('', observer), [observer])
  assert.deepEqual(observerList('40,-74\n-33,151,0.1', observer), [{ lat: 40, lon: -74, height: 0 }, { lat: -33, lon: 151, height: .1 }])
  for (const text of ['91,0', '0,181', '0,0,101', '0,,0', 'x,2']) assert.throws(() => observerList(text, observer))
})
test('missing numerical values remain unavailable rather than looking like measured zero', () => {
  for (const value of [null, undefined, '', NaN]) assert.equal(num(value), 'Unavailable')
  assert.equal(num(0), '0'); assert.equal(num('0'), '0')
})
