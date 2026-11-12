import { normalizeState } from './store.js'
const KEY = 'cosmic-atlas.presets.v1'
const MAX_BYTES = 2_000_000
function storageOrDefault(storage) { try { return storage ?? globalThis.localStorage } catch { return null } }
export function listPresets(storage) {
  try {
    const records = JSON.parse(storageOrDefault(storage)?.getItem(KEY) || '[]')
    if (!Array.isArray(records)) return []
    return records.filter(record => typeof record.id === 'string' && typeof record.name === 'string').flatMap(record => {
      try { return [{ ...record, state: normalizeState(record.state) }] } catch { return [] }
    })
  } catch { return [] }
}
function write(records, storage) {
  try {
    const target = storageOrDefault(storage)
    if (!target) return { ok: false, error: 'Local storage is unavailable; export JSON to keep this setup.' }
    target.setItem(KEY, JSON.stringify(records))
    return { ok: true }
  } catch { return { ok: false, error: 'The browser could not save this setup; export JSON to keep it.' } }
}
export function savePreset(name, state, { id, storage } = {}) {
  const label = String(name).trim()
  if (!label || label.length > 120) throw Error('Preset name must be 1–120 characters')
  const records = listPresets(storage)
  const record = { id: id || globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: label, updated_at: new Date().toISOString(), state: normalizeState(state) }
  const index = records.findIndex(item => item.id === record.id)
  if (index >= 0) records[index] = record; else records.push(record)
  return { ...write(records, storage), preset: record }
}
export function loadPreset(id, storage) { return listPresets(storage).find(record => record.id === id) || null }
export function deletePreset(id, storage) { return write(listPresets(storage).filter(record => record.id !== id), storage) }
export function renamePreset(id, name, storage) {
  const record = loadPreset(id, storage)
  if (!record) throw Error('Saved setup was not found')
  return savePreset(name, record.state, { id, storage })
}
export function exportPreset(state, name = 'Cosmic Atlas setup') {
  return JSON.stringify({ name, exported_at: new Date().toISOString(), ...normalizeState(state) }, null, 2)
}
export async function importPreset(input) {
  const text = typeof input === 'string' ? input : await input.text()
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw Error('Preset file exceeds 2 MB')
  const parsed = JSON.parse(text)
  const raw = parsed.state || parsed
  const { name, exported_at, ...state } = raw
  return { name: typeof parsed.name === 'string' ? parsed.name.slice(0, 120) : 'Imported setup', state: normalizeState(state) }
}
export async function fetchPreset(id = 'default') {
  if (!/^[a-z-]+$/.test(id)) throw Error('Invalid preset identifier')
  const response = await fetch(`presets/${id}.json`)
  if (!response.ok) throw Error(`Could not load preset (${response.status})`)
  return normalizeState(await response.json())
}
