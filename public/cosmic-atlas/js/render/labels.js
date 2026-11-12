// DOM labels remain crisp after the WebGL ASCII pass. Each accepted rectangle is disjoint.
export function layoutLabels(candidates, width, height, limit = 36, reserved = []) {
  const accepted = []
  for (const item of [...candidates].sort((a, b) => b.priority - a.priority)) {
    if (accepted.length >= limit) break
    const w = Math.min(item.marker ? 280 : 240, item.name.length * 6.7 + (item.marker ? 28 : 14)), h = 20
    const radius = item.bodyRadius > 6 ? item.bodyRadius : 0
    const slots = radius ? [[radius + 12, -10], [-radius - w - 12, -10], [-w / 2, -radius - 28], [-w / 2, radius + 12]] : [[12, -22], [12, 8], [-w - 12, -22], [-w - 12, 8], [14, -48], [14, 34]]
    if (item.screenNote) for (let y = 8; y + h < height - 8; y += 24) for (const x of [8, (width - w) / 2, width - w - 8]) slots.push([x - item.x, y - item.y])
    for (const [dx, dy] of slots) {
      const box = { x: item.x + dx, y: item.y + dy, w, h }
      if (box.x < 8 || box.y < 8 || box.x + w > width - 8 || box.y + h > height - 8) continue
      if (reserved.some(a => box.x < a.x + a.w + 3 && box.x + w + 3 > a.x && box.y < a.y + a.h + 3 && box.y + h + 3 > a.y)) continue
      if (accepted.some(a => box.x < a.x + a.w + 5 && box.x + w + 5 > a.x && box.y < a.y + a.h + 3 && box.y + h + 3 > a.y)) continue
      accepted.push({ ...item, ...box, anchorX: item.x, anchorY: item.y })
      break
    }
  }
  return accepted
}

export function createLabels(container, onSelect) {
  const element = document.createElement('div')
  element.className = 'scene-labels'
  container.append(element)
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  leaders.classList.add('label-leaders'); element.append(leaders)
  let previous = ''
  return {
    update(candidates, width, height, limit) {
      const bounds = container.getBoundingClientRect()
      const reserved = [...container.querySelectorAll('.focus-card,.view-switch,.viewport-heading,.viewport-footer,.scale-jumps')].map(el => { const r = el.getBoundingClientRect(); return { x: r.left - bounds.left, y: r.top - bounds.top, w: r.width, h: r.height } })
      const labels = layoutLabels(candidates, width, height, limit, reserved)
      const key = labels.map(x => `${x.key}:${x.name}:${!!x.marker}:${Math.round(x.x)}:${Math.round(x.y)}`).join('|')
      if (key === previous) return
      previous = key
      element.querySelectorAll('.scene-label').forEach(e => e.remove()); leaders.replaceChildren()
      for (const item of labels) {
        const button = document.createElement(item.layer ? 'button' : 'span'); if (item.layer) button.type = 'button'
        button.className = 'scene-label'; button.textContent = item.name
        button.style.cssText = `left:${item.x}px;top:${item.y}px;color:${item.color};max-width:${item.w}px`
        button.title = item.title || (item.marker ? 'Locator glyph; the physical sphere has not been enlarged.' : item.name)
        if (item.marker) { button.dataset.bodyMarker = item.id; button.style.paddingLeft = '18px' }
        if (item.layer) button.onclick = () => onSelect(item.layer, item.id)
        else { button.dataset.schematic = 'true'; button.style.pointerEvents = 'none' }
        element.append(button)
        const line = document.createElementNS(leaders.namespaceURI, 'line')
        const dx = item.x + item.w / 2 - item.anchorX, dy = item.y + 10 - item.anchorY, length = Math.hypot(dx, dy), radius = Math.min(item.bodyRadius || 0, length)
        line.setAttribute('x1', item.anchorX + (length ? dx / length * radius : 0)); line.setAttribute('y1', item.anchorY + (length ? dy / length * radius : 0))
        line.setAttribute('x2', Math.max(item.x, Math.min(item.x + item.w, item.anchorX)))
        line.setAttribute('y2', item.y + 10); line.setAttribute('stroke', item.color)
        if (!item.screenNote) leaders.append(line)
        if (item.marker) {
          const glyph = document.createElementNS(leaders.namespaceURI, 'path'), x = item.x + 7, y = item.y + 10
          glyph.setAttribute('d', `M${x} ${y - 4}l4 4-4 4-4-4Z`); glyph.setAttribute('fill', 'none'); glyph.setAttribute('stroke', item.color); glyph.setAttribute('stroke-width', '1'); leaders.append(glyph)
        }
      }
    },
    dispose() { element.remove() },
  }
}
