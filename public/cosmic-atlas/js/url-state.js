import { normalizeState } from './store.js'
const MAX_BYTES = 2_000_000
const textEncoder = new TextEncoder(), textDecoder = new TextDecoder('utf-8', { fatal: true })
function base64url(bytes) {
  let value = ''
  for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384))
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unbase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid shared link encoding')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
async function streamBytes(stream) {
  const reader = stream.getReader(), chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) { await reader.cancel(); throw Error('Shared link exceeds the 2 MB state limit') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
export async function encodeState(state) {
  const bytes = textEncoder.encode(JSON.stringify(normalizeState(state)))
  if (bytes.length > MAX_BYTES) throw Error('State exceeds the 2 MB sharing limit')
  if (typeof CompressionStream !== 'undefined') {
    try { return `v1z.${base64url(await streamBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))))}` } catch { /* A browser without deflate can still share plain JSON. */ }
  }
  return `v1j.${base64url(bytes)}`
}
export async function decodeState(encoded) {
  const value = encoded.replace(/^#(?:state=)?/, '')
  if (value.length > MAX_BYTES * 2) throw Error('Shared link is too large')
  const match = /^(v1[zj])\.(.+)$/.exec(value)
  if (!match) throw Error('Unsupported shared link version')
  let bytes = unbase64url(match[2])
  if (match[1] === 'v1z') {
    if (typeof DecompressionStream === 'undefined') throw Error('This browser cannot open compressed shared links')
    bytes = await streamBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')))
  }
  if (bytes.length > MAX_BYTES) throw Error('Shared link state is too large')
  return normalizeState(JSON.parse(textDecoder.decode(bytes)))
}
export async function readURLState(location = globalThis.location) {
  const hash = location?.hash || ''
  return hash.startsWith('#state=') || /^#v1[zj]\./.test(hash) ? decodeState(hash) : null
}
export async function writeURLState(state, { replace = true, location = globalThis.location, history = globalThis.history } = {}) {
  const hash = `#state=${await encodeState(state)}`
  if (history && location) history[replace ? 'replaceState' : 'pushState'](null, '', `${location.pathname}${location.search}${hash}`)
  return hash
}
