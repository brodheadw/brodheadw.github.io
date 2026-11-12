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

test('schematic extent notes find distinct mobile positions even when their boundaries are offscreen', () => {
  const reserved = [{x:22,y:58,w:214,h:110},{x:270,y:49,w:100,h:50},{x:22,y:265,w:346,h:140}]
  const notes = [5000,100000].map(radius => ({name:`${radius.toLocaleString('en-US')} AU · Oort Cloud schematic`,x:195,y:210,screenNote:true,priority:30}))
  const labels = layoutLabels(notes,390,420,14,reserved)
  assert.equal(labels.length,2)
  for (const a of labels) for (const b of reserved) assert.ok(a.x+a.w<=b.x || a.x>=b.x+b.w || a.y+a.h<=b.y || a.y>=b.y+b.h)
  assert.ok(labels[0].y+labels[0].h<=labels[1].y || labels[1].y+labels[1].h<=labels[0].y)
})
