import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { csvRecords, parseCSVTable, jsonToTable, readBinaryTable, rowAt, filterIndices } from '../../js/data/schema.js'

test('CSV handles quoted commas/newlines, missing values and provenance strings', () => {
  assert.deepEqual(csvRecords('name,ra,dec\n"one,\ntwo",1,2'), [['name', 'ra', 'dec'], ['one,\ntwo', '1', '2']])
  const table = parseCSVTable('name,ra_deg,dec_deg,distance_mpc,z,class\n"M31, Andromeda",10.6,41.2,0.778,,galaxy\nunknown,0,0,,0.1,')
  assert.equal(table.length, 2)
  assert.equal(rowAt(table, 0).name, 'M31, Andromeda')
  assert.ok(Number.isNaN(table.columns.z[0]))
  assert.ok(table.columns.mpc[1] > 418)
  assert.deepEqual(Array.from(filterIndices(table, { mpcMax: 3, text: 'andromeda' })), [0])
  assert.deepEqual(Array.from(filterIndices(table, { cls: ['galaxy'] })), [0])
  assert.throws(() => parseCSVTable('name,ra,dec\nbad,,0'))
  assert.throws(() => parseCSVTable('name,ra,dec\nbad,1,91'))
  assert.throws(() => parseCSVTable('name,ra,dec\n"bad,1,2'))
})

test('curated and real catalogs load into columns without object-row expansion', async () => {
  const curated = jsonToTable(JSON.parse(await fs.readFile(new URL('../../data/curated.json', import.meta.url), 'utf8')))
  assert.equal(rowAt(curated, 1).name, 'Boötes III')
  assert.ok(Math.abs(rowAt(curated, 1).mpc - 0.046) < 1e-8)
  for (const name of ['galaxies', 'neutrinos', 'fermi']) {
    const table = parseCSVTable(await fs.readFile(new URL(`../../data/${name}.csv`, import.meta.url), 'utf8'))
    assert.ok(table.columns.ra instanceof Float32Array)
    assert.ok(table.length > 200)
  }
})

test('binary table validates layout and matches CSV precision', () => {
  const buffer = new ArrayBuffer(16), view = new DataView(buffer)
  ;[209.3, 26.8, 0.046, NaN].forEach((value, index) => view.setFloat32(index * 4, value, true))
  const header = { schema: 1, format: 'cosmic-atlas-columnar-v1', length: 1, columns: ['ra', 'dec', 'mpc', 'z'].map((name, index) => ({ name, dtype: 'float32', offset: index * 4, length: 1 })), strings: { name: ['Boötes III'] } }
  const table = readBinaryTable(buffer, header)
  assert.equal(rowAt(table, 0).name, 'Boötes III')
  assert.ok(Math.abs(table.columns.ra[0] - 209.3) < 0.0001)
  assert.throws(() => readBinaryTable(buffer, { ...header, length: 2 }))
})

test('published binary catalogs preserve row counts and curated object classification', async () => {
  for (const name of ['curated', 'galaxies', 'neutrinos', 'fermi']) {
    const header = JSON.parse(await fs.readFile(new URL(`../../data/${name}.header.json`, import.meta.url), 'utf8'))
    const bytes = await fs.readFile(new URL(`../../data/${name}.bin`, import.meta.url))
    const table = readBinaryTable(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), header)
    assert.equal(table.length, header.length)
    if (name === 'curated') {
      assert.equal(rowAt(table, 0).type, 'observer')
      assert.equal(rowAt(table, 1).type, 'target')
    } else if (name === 'neutrinos' || name === 'fermi') assert.ok(Number.isNaN(table.columns.mpc[0]), 'direction-only data have no assigned distance')
  }
})
