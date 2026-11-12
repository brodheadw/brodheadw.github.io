import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutLabels } from '../../js/render/labels.js'

test('crowded satellite labels have disjoint bounds and retain the target', () => {
  const labels = layoutLabels(Array.from({ length: 80 }, (_, id) => ({ id, name: `Satellite ${id}`, x: 180 + id % 3, y: 160, priority: id === 9 ? 100 : 1 })), 800, 600)
  assert.equal(labels[0].id, 9)
  assert.ok(labels.length < 80)
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = labels[i], b = labels[j]
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
  }
})

test('labels avoid the viewport controls as well as each other', () => {
  const labels = layoutLabels([{name:'Target',x:150,y:100,priority:100}],500,400,36,[{x:140,y:60,w:180,h:120}])
  for (const box of labels) assert.ok(box.x+box.w<=140 || box.x>=320 || box.y+box.h<=60 || box.y>=180)
})
