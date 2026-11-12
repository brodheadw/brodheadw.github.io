import { escapeHTML } from '../util.js'
export const esc = escapeHTML
export const $ = (el, query) => el.querySelector(query)
export const num = (x, digits = 2) => Number.isFinite(Number(x)) ? Number(x).toLocaleString(undefined, { maximumFractionDigits: digits }) : 'Unavailable'
export const utc = x => x ? new Date(x).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Unavailable'
export function downloadFile(name, text, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
export const rows = values => `<table class="units">${values.map(([key, value]) => `<tr><th>${esc(key)}</th><td>${value}</td></tr>`).join('')}</table>`
export function listen(app, render) { render(); return app.subscribe(render) }
export function histogram(values, { label = '', color = 'var(--accent)', bins = 16 } = {}) {
  const finite = Array.from(values).filter(Number.isFinite)
  if (!finite.length) return '<div class="empty">No values in this selection.</div>'
  let min = Infinity, max = -Infinity; for (const n of finite) { min = Math.min(min, n); max = Math.max(max, n) }
  const counts = new Array(bins).fill(0), span = max - min || 1
  for (const n of finite) counts[Math.min(bins - 1, Math.floor((n - min) / span * bins))]++
  return histogramBars(counts, { min, max, label, color })
}
export function histogramBars(counts, { min = 0, max = counts.length, label = '', color = 'var(--accent)' } = {}) {
  const peak = Math.max(1, ...counts), w = 280 / counts.length
  return `<svg class="plot" viewBox="0 0 300 105" role="img" aria-label="${esc(label)} histogram">${counts.map((count, i) => `<rect x="${10 + i * w}" y="${80 - count / peak * 69}" width="${Math.max(.5, w - 2)}" height="${count / peak * 69}" fill="${color}"><title>${count}</title></rect>`).join('')}<text x="10" y="97">${num(min, 2)}</text><text x="290" y="97" text-anchor="end">${num(max, 2)} ${esc(label)}</text></svg>`
}
