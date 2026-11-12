// DOM labels remain crisp after the WebGL ASCII pass. Each accepted rectangle is disjoint.
export function layoutLabels(candidates, width, height, limit = 36, reserved = []) {
  const accepted = []
  for (const item of [...candidates].sort((a, b) => b.priority - a.priority)) {
    if (accepted.length >= limit) break
    const w = Math.min(240, item.name.length * 6.7 + 14), h = 20
    const slots = [[12, -22], [12, 8], [-w - 12, -22], [-w - 12, 8], [14, -48], [14, 34]]
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
      const key = labels.map(x => `${x.key}:${Math.round(x.x)}:${Math.round(x.y)}`).join('|')
      if (key === previous) return
      previous = key
      element.querySelectorAll('button').forEach(e => e.remove()); leaders.replaceChildren()
      for (const item of labels) {
        const button = document.createElement('button'); button.type = 'button'
        button.className = 'scene-label'; button.textContent = item.name
        button.style.cssText = `left:${item.x}px;top:${item.y}px;color:${item.color};max-width:${item.w}px`
        button.onclick = () => onSelect(item.layer, item.id)
        element.append(button)
        const line = document.createElementNS(leaders.namespaceURI, 'line')
        line.setAttribute('x1', item.anchorX); line.setAttribute('y1', item.anchorY)
        line.setAttribute('x2', Math.max(item.x, Math.min(item.x + item.w, item.anchorX)))
        line.setAttribute('y2', item.y + 10); line.setAttribute('stroke', item.color)
        leaders.append(line)
      }
    },
    dispose() { element.remove() },
  }
}
