export const MAX_OMM_BYTES = 64 * 1024 * 1024

export function importedSnapshot(raw, { name = 'orbital-elements.json', sha256 = '', importedAt = new Date().toISOString() } = {}) {
  const objects = Array.isArray(raw) ? raw : Array.isArray(raw?.objects) ? raw.objects : raw?.NORAD_CAT_ID ? [raw] : null
  if (!objects?.length || objects.length > 150000) throw Error('Import needs 1–150,000 OMM element records.')
  if (!Number.isFinite(Date.parse(importedAt))) throw Error('Invalid import timestamp.')
  const filename = String(name).slice(0, 200)
  return { schema: 1, objects, fetched_at: importedAt, source: `Browser-local file: ${filename}`, coverage: `User-imported set of ${objects.length} objects; completeness and source provenance are not verified.`, imported: { filename, sha256, importedAt }, claimedSource: typeof raw?.source === 'string' ? raw.source.slice(0, 2000) : null, claimedFetchedAt: typeof raw?.fetched_at === 'string' && Number.isFinite(Date.parse(raw.fetched_at)) ? raw.fetched_at : null }
}
