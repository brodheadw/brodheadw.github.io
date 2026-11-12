export const SATELLITE_DATA_ROOT = 'https://raw.githubusercontent.com/brodheadw/brodheadw.github.io/satellite-data/data/satellites/'

export async function resolveSatelliteSource(fetcher = fetch) {
  const response = await fetcher('data/satellites/status.json', { cache: 'no-store' })
  if (!response.ok) throw Error(`Satellite status unavailable (HTTP ${response.status})`)
  const local = await response.json()
  let remote
  if (local.remote_status_url) {
    if (local.remote_status_url !== SATELLITE_DATA_ROOT + 'status.json') throw Error('Unrecognized satellite status source')
    try { const result = await fetcher(local.remote_status_url, { cache: 'no-store' }); if (result.ok) remote = await result.json() } catch { /* The bundled snapshot remains usable offline. */ }
  }
  if (remote?.available) return { status: remote, url: SATELLITE_DATA_ROOT + 'gp.json' }
  if (local.available) return { status: local, url: 'data/satellites/gp.json' }
  throw Error([remote?.error || local.error || 'No validated public satellite snapshot is available.', remote?.recovery || local.recovery].filter(Boolean).join(' '))
}
