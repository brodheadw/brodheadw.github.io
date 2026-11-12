export const satelliteSourceKey = source => source?.kind === 'local' ? `local:${source.sha256 || source.name || 'unidentified'}` : 'published'
export function satelliteSourceMatches(source, snapshot) {
  if (!snapshot) return false
  if (source?.kind !== 'local') return !snapshot.imported
  return !!source.sha256 && source.sha256 === snapshot.imported?.sha256
}
