// The atlas core: data, view state, the 3D and sky-map renderers, and the viewport tools.
// Sidebar panels never touch this file's internals; they use the API returned by createAtlas()
// and listen for its events: 'select', 'data', 'view', 'overlay', 'sync'.
import { $, rad, xyz, parseCSV } from './util.js'

const SQ2 = Math.SQRT2
const COLORS = { target: '#ffcb6c', major: '#65baff', dwarf: '#e9adff', catalog: '#65baff' }

export function createAtlas() {
  const bus = new EventTarget()
  const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }))

  const state = {
    layers: { names: true, axes: false, sight: true, gamma: true },
    radius: 1.5, overlayKey: 'none', overlayOpacity: 0.85, overlayNote: 'Overlays show in the sky map view.',
    ascii: false, sky: false, syncStatus: 'Checking for published catalogs…', lastSync: null,
  }
  const data = { items: [], imported: [], neutrinos: [], fermi: [], overlays: [], targets: null, repro: null }
  let selected = null, hot = null

  // ---------- 3D view ----------
  const cv = $('cv'), ctx = cv.getContext('2d')
  const sky = $('sky'), sctx = sky.getContext('2d')
  let W = 0, H = 0, dpr = 1
  let yaw = .56, pitch = -.26, zoom = 1, ox = 0, oy = 0, projected = []

  function item(name, ra, dec, mpc, type, source = 'curated nearby-galaxy list', z = NaN) {
    return { name, ra: +ra, dec: +dec, r: +mpc, type, source, z, xyz: xyz(+ra, +dec, +mpc) }
  }

  function resize() {
    const rect = cv.parentElement.getBoundingClientRect()
    W = rect.width; H = rect.height; dpr = Math.min(2, devicePixelRatio || 1)
    for (const [c, x] of [[cv, ctx], [sky, sctx]]) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    draw()
  }

  function rot([x, y, z]) {
    const c = Math.cos(yaw), s = Math.sin(yaw), X = c * x - s * y, Y = s * x + c * y, cp = Math.cos(pitch), sp = Math.sin(pitch)
    return [X, cp * Y - sp * z, sp * Y + cp * z]
  }
  function proj(v) {
    const [x, y, z] = rot(v), fac = 1 / (1 + z / 4.8), unit = Math.min(W, H) * .31 * zoom / state.radius
    return { x: W / 2 + ox + x * unit * fac, y: H / 2 + oy - y * unit * fac, z, fac }
  }
  function line(a, b, color, width = 1) {
    const p = proj(a), q = proj(b)
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke()
  }
  // While ASCII renders, text is queued and drawn as real text on top of the glyph grid.
  let deferred = null
  function label(c, text, x, y) { if (deferred) deferred.push([c, c.font, c.fillStyle, text, x, y]); else c.fillText(text, x, y) }
  function circle(x, y, r, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill() }

  function draw3d() {
    ctx.clearRect(0, 0, W, H)
    const { layers, radius } = state
    if (layers.axes) {
      // Equatorial guides on a reference sphere: directions, not a physical floor.
      const R = radius * .88
      const arc = (pts, color, width) => { for (let k = 1; k < pts.length; k++) line(pts[k - 1], pts[k], color, width) }
      for (const dec of [-60, -30, 0, 30, 60]) {
        const pts = []; for (let ra = 0; ra <= 360; ra += 6) pts.push(xyz(ra, dec, R))
        arc(pts, dec === 0 ? '#48607870' : '#29384b46', dec === 0 ? 1.15 : .7)
      }
      ctx.font = '10px system-ui'; ctx.fillStyle = '#647d97'
      for (let ra = 0; ra < 360; ra += 45) {
        const pts = []; for (let dec = -75; dec <= 75; dec += 5) pts.push(xyz(ra, dec, R))
        arc(pts, '#28374a3d', .7)
        const q = proj(xyz(ra, 0, R)); label(ctx, ra + '°', q.x + 4, q.y - 4)
      }
      const pole = proj(xyz(0, 90, R)); ctx.fillStyle = '#7087a1'; label(ctx, 'NCP / +90°', pole.x + 5, pole.y - 5)
    }
    if (layers.sight) for (const nu of data.neutrinos.slice(0, 1200)) {
      const dir = xyz(nu.ra, nu.dec, radius * .92), p = proj(dir)
      line([0, 0, 0], dir, '#56eabc25', .75); circle(p.x, p.y, 2.1, '#6ef2bd9a')
    }
    if (layers.gamma) for (const ob of data.fermi.slice(0, 900)) {
      const p = proj(xyz(ob.ra, ob.dec, radius * .91)); circle(p.x, p.y, 2, '#ff788d99')
    }
    projected = []
    for (const ob of [...data.items, ...data.imported]) if (ob.r <= radius && ob.type !== 'observer') projected.push({ ob, p: proj(ob.xyz) })
    projected.sort((a, b) => a.p.z - b.p.z)
    for (const { ob, p } of projected) {
      const isTarget = ob.type === 'target', isMajor = ob.type === 'major', color = COLORS[ob.type] || COLORS.dwarf
      const rr = (isTarget ? 6 : isMajor ? 4.5 : 3) * Math.max(.65, Math.min(1.6, p.fac))
      if (ob === selected || ob === hot) { ctx.beginPath(); ctx.arc(p.x, p.y, rr + 7, 0, 2 * Math.PI); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke() }
      circle(p.x, p.y, rr + 4, color + '24'); circle(p.x, p.y, rr, color)
      if (layers.names && (isTarget || isMajor || ob === selected || ob === hot || zoom > 1.5)) {
        ctx.font = (ob === selected || isTarget ? 'bold ' : '') + '11px system-ui'
        ctx.fillStyle = ob === selected ? '#fff' : color; label(ctx, ob.name, p.x + rr + 5, p.y - rr - 3)
      }
    }
    const zero = proj([0, 0, 0]); circle(zero.x, zero.y, 4, '#fff')
    ctx.font = '11px system-ui'; ctx.fillStyle = '#fff'; label(ctx, 'Sun / observer', zero.x + 8, zero.y + 13)
    $('counter').textContent = projected.length + ' objects'
    $('readout').textContent = 'Scale: ' + radius.toFixed(2) + ' Mpc radius'
  }

  // ---------- Sky map: Hammer-Aitoff, equatorial J2000, RA increasing to the left ----------
  let sz = 1, spx = 0, spy = 0, sdrag = null, skyPts = [], skyHot = null, overlay = null
  const overlayCanvas = document.createElement('canvas'), overlayCtx = overlayCanvas.getContext('2d')

  function hammer(ra, dec) {
    const l = ((180 - ra) % 360 + 540) % 360 - 180, p = dec * rad, lr = l * rad, z = Math.sqrt(1 + Math.cos(p) * Math.cos(lr / 2))
    return [2 * SQ2 * Math.cos(p) * Math.sin(lr / 2) / z, SQ2 * Math.sin(p) / z]
  }
  const skyScale = () => Math.min(W / (4 * SQ2), H / (2 * SQ2)) * .94 * sz
  function toScreen(ra, dec) { const [x, y] = hammer(ra, dec), s = skyScale(); return [W / 2 + spx + x * s, H / 2 + spy - y * s] }
  function fromScreen(sx, sy) {
    const s = skyScale(), x = (sx - W / 2 - spx) / s, y = -(sy - H / 2 - spy) / s
    if (x * x / 8 + y * y / 2 > 1) return null
    const z = Math.sqrt(1 - x * x / 16 - y * y / 4), l = 2 * Math.atan2(z * x, 2 * (2 * z * z - 1)) / rad, p = Math.asin(Math.max(-1, Math.min(1, z * y))) / rad
    return [((180 - l) % 360 + 360) % 360, p]
  }
  function skyPath(pts, color, width = 1, dash = []) {
    sctx.beginPath(); sctx.setLineDash(dash)
    let prev = null
    for (const [ra, dec] of pts) {
      const [x, y] = toScreen(ra, dec)
      if (prev !== null && Math.abs(x - prev) < skyScale() * SQ2) sctx.lineTo(x, y); else sctx.moveTo(x, y)
      prev = x
    }
    sctx.strokeStyle = color; sctx.lineWidth = width; sctx.stroke(); sctx.setLineDash([])
  }
  function galToEq(l, b) {
    l *= rad; b *= rad
    const ag = 192.85948 * rad, dg = 27.12825 * rad, lo = 122.93192 * rad
    const d = Math.asin(Math.sin(b) * Math.sin(dg) + Math.cos(b) * Math.cos(dg) * Math.cos(lo - l))
    const y = Math.cos(b) * Math.sin(lo - l), x = Math.sin(b) * Math.cos(dg) - Math.cos(b) * Math.sin(dg) * Math.cos(lo - l)
    return [((Math.atan2(y, x) + ag) / rad + 360) % 360, d / rad]
  }
  function circleOnSky(ra, dec, r) {
    const pts = [], d = dec * rad, rr = r * rad
    for (let k = 0; k <= 24; k++) {
      const th = k / 24 * 2 * Math.PI, d2 = Math.asin(Math.sin(d) * Math.cos(rr) + Math.cos(d) * Math.sin(rr) * Math.cos(th))
      const a2 = ra * rad + Math.atan2(Math.sin(th) * Math.sin(rr) * Math.cos(d), Math.cos(rr) - Math.sin(d) * Math.sin(d2))
      pts.push([a2 / rad, d2 / rad])
    }
    return pts
  }
  function paintOverlay() {
    if (!overlay) return
    const q = sz > 2 ? .75 : .5, w = Math.max(1, Math.round(W * q)), h = Math.max(1, Math.round(H * q))
    overlayCanvas.width = w; overlayCanvas.height = h
    const img = overlayCtx.createImageData(w, h), o = img.data, src = overlay.data, SW = overlay.w, SH = overlay.h
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = fromScreen(i / q, j / q); if (!c) continue
      const u = Math.min(SW - 1, Math.floor((360 - c[0]) % 360 / 360 * SW)), v = Math.min(SH - 1, Math.floor((90 - c[1]) / 180 * SH))
      const s = (v * SW + u) * 4, d = (j * w + i) * 4
      o[d] = src[s]; o[d + 1] = src[s + 1]; o[d + 2] = src[s + 2]; o[d + 3] = 255
    }
    overlayCtx.putImageData(img, 0, 0)
    sctx.globalAlpha = state.overlayOpacity; sctx.imageSmoothingEnabled = true; sctx.drawImage(overlayCanvas, 0, 0, W, H); sctx.globalAlpha = 1
  }
  function drawSky() {
    sctx.clearRect(0, 0, W, H)
    const s = skyScale(), { layers } = state
    sctx.save(); sctx.beginPath(); sctx.ellipse(W / 2 + spx, H / 2 + spy, 2 * SQ2 * s, SQ2 * s, 0, 0, 2 * Math.PI)
    sctx.fillStyle = '#070c13'; sctx.fill(); sctx.clip()
    paintOverlay()
    for (let dec = -60; dec <= 60; dec += 30) { const p = []; for (let ra = 0; ra <= 360; ra += 2) p.push([ra, dec]); skyPath(p, dec ? '#2a3b4c80' : '#4a627a90', dec ? .7 : 1) }
    for (let ra = 0; ra < 360; ra += 30) { const p = []; for (let dec = -90; dec <= 90; dec += 2) p.push([ra === 0 ? 359.999 : ra, dec]); skyPath(p, '#2a3b4c80', .7) }
    { const p = []; for (let l = 0; l <= 360; l++) p.push(galToEq(l, 0)); skyPath(p, '#c9a86a70', 1, [5, 5]) }
    skyPts = []
    sctx.fillStyle = '#6ebeff59'
    for (const ob of data.imported) { const [x, y] = toScreen(ob.ra, ob.dec); sctx.fillRect(x - .6, y - .6, 1.3, 1.3) }
    if (layers.gamma) {
      sctx.fillStyle = '#ff788dcc'
      for (const f of data.fermi) { const [x, y] = toScreen(f.ra, f.dec); sctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2); skyPts.push({ x, y, kind: 'fermi', ob: f }) }
    }
    if (layers.sight) for (const n of data.neutrinos) {
      if (Number.isFinite(n.err)) skyPath(circleOnSky(n.ra, n.dec, n.err), '#6ef2bd80', 1)
      const [x, y] = toScreen(n.ra, n.dec); sctx.fillStyle = '#6ef2bd'; sctx.fillRect(x - 1.5, y - 1.5, 3, 3); skyPts.push({ x, y, kind: 'nu', ob: n })
    }
    for (const ob of data.items) {
      if (ob.type === 'observer') continue
      const [x, y] = toScreen(ob.ra, ob.dec), tg = ob.type === 'target', col = COLORS[ob.type] || COLORS.dwarf
      sctx.beginPath(); sctx.arc(x, y, tg ? 5 : 3, 0, 2 * Math.PI); sctx.fillStyle = col; sctx.fill()
      if (tg || ob === selected) { sctx.beginPath(); sctx.arc(x, y, 11, 0, 2 * Math.PI); sctx.strokeStyle = col; sctx.lineWidth = 1.3; sctx.stroke() }
      if (layers.names && (tg || sz > 2.5 || ob === selected)) { sctx.font = (tg ? 'bold ' : '') + '11px system-ui'; sctx.fillStyle = col; label(sctx, ob.name, x + 8, y - 6) }
      skyPts.push({ x, y, kind: 'gal', ob })
    }
    sctx.restore()
    sctx.beginPath(); sctx.ellipse(W / 2 + spx, H / 2 + spy, 2 * SQ2 * s, SQ2 * s, 0, 0, 2 * Math.PI); sctx.strokeStyle = '#3b5266'; sctx.lineWidth = 1; sctx.stroke()
    sctx.font = '10px DM Mono,monospace'; sctx.fillStyle = '#7d93a6'
    for (let h = 0; h < 24; h += 2) { const [x, y] = toScreen(h * 15, 0); label(sctx, h + 'h', x + 3, y - 3) }
    for (const d of [-60, -30, 30, 60]) { const [x, y] = toScreen(180, d); label(sctx, (d > 0 ? '+' : '') + d + '°', x + 3, y - 3) }
    { const [x, y] = toScreen(...galToEq(30, 0)); sctx.fillStyle = '#c9a86a'; label(sctx, 'Galactic plane', x + 6, y + 12) }
    if (skyHot) {
      const n = skyHot.ob; sctx.font = '12px system-ui'; sctx.fillStyle = '#fff'
      label(sctx, skyHot.kind === 'nu' ? n.name + ' · neutrino' : skyHot.kind === 'fermi' ? n.name + (n.cls ? ' · ' + n.cls : '') : n.name, skyHot.x + 9, skyHot.y + 14)
    }
    $('counter').textContent = (data.imported.length + data.fermi.length + data.neutrinos.length).toLocaleString() + ' objects'
  }

  // ---------- ASCII mode: shrink the finished frame to a character grid, redraw each cell as a glyph ----------
  // Hit-testing uses the projected positions, so selection and hover work unchanged.
  const asciiGrid = document.createElement('canvas'), asciiCtx = asciiGrid.getContext('2d', { willReadFrequently: true })
  const ASCII_CHARS = ' .,:;-=+*%#@', CELL_W = 7, CELL_H = 12
  function asciify(c, x) {
    const cols = Math.ceil(W / CELL_W), rows = Math.ceil(H / CELL_H)
    asciiGrid.width = cols; asciiGrid.height = rows; asciiCtx.imageSmoothingQuality = 'high'; asciiCtx.drawImage(c, 0, 0, cols, rows)
    const px = asciiCtx.getImageData(0, 0, cols, rows).data
    x.clearRect(0, 0, W, H); x.font = 'bold 11px DM Mono,monospace'; x.textBaseline = 'top'
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 4, r = px[k], g = px[k + 1], b = px[k + 2], a = px[k + 3] / 255
      const lum = Math.sqrt(Math.min(1, (.299 * r + .587 * g + .114 * b) / 255 * a * 3)), idx = Math.round(lum * (ASCII_CHARS.length - 1))
      if (!idx) continue
      const m = Math.max(r, g, b, 1) / 255
      x.fillStyle = 'rgb(' + r / m + ',' + g / m + ',' + b / m + ')'; x.fillText(ASCII_CHARS[idx], i * CELL_W, j * CELL_H)
    }
    x.textBaseline = 'alphabetic'
  }

  function draw() {
    if (!W) return
    const [c, x, render] = state.sky ? [sky, sctx, drawSky] : [cv, ctx, draw3d]
    if (!state.ascii) return render()
    deferred = []
    render(); asciify(c, x)
    for (const [cx, font, fill, text, tx, ty] of deferred) { cx.font = font; cx.fillStyle = fill; cx.fillText(text, tx, ty) }
    deferred = null
  }

  // ---------- Input: 3D ----------
  let drag = false, dragMoved = false, px = 0, py = 0, pointerLocked = false
  function rotateView(dx, dy) { yaw = (yaw - dx * .0055) % (2 * Math.PI); pitch = (pitch - dy * .0055) % (2 * Math.PI); draw() } // no polar clamp: tumble freely
  const pick = (x, y, r) => [...projected].reverse().find(o => Math.hypot(o.p.x - x, o.p.y - y) < r)
  cv.addEventListener('pointerdown', e => {
    if (pointerLocked || (e.pointerType === 'mouse' && e.button !== 0)) return
    cv.setPointerCapture(e.pointerId); drag = true; dragMoved = false; px = e.clientX; py = e.clientY
  })
  cv.addEventListener('pointermove', e => {
    if (pointerLocked) return rotateView(e.movementX || 0, e.movementY || 0)
    if (drag) {
      const dx = e.clientX - px, dy = e.clientY - py
      if (Math.hypot(dx, dy) > 1) dragMoved = true
      rotateView(dx, dy); px = e.clientX; py = e.clientY
    } else {
      const r = cv.getBoundingClientRect()
      hot = pick(e.clientX - r.left, e.clientY - r.top, 12)?.ob || null; draw()
    }
  })
  cv.addEventListener('pointerup', e => {
    if (pointerLocked) return
    drag = false
    if (!dragMoved) { const r = cv.getBoundingClientRect(), o = pick(e.clientX - r.left, e.clientY - r.top, 13); if (o) select(o.ob) }
  })
  cv.addEventListener('pointercancel', () => { drag = false })
  cv.addEventListener('wheel', e => {
    e.preventDefault()
    const b = cv.getBoundingClientRect(), sx = e.clientX - b.left - W / 2, sy = e.clientY - b.top - H / 2
    const z2 = Math.max(.25, Math.min(500, zoom * Math.exp(-e.deltaY * .001))), k = z2 / zoom
    ox = sx - k * (sx - ox); oy = sy - k * (sy - oy); zoom = z2; if (zoom <= 1) ox = oy = 0
    draw()
  }, { passive: false })

  // Free look: pointer lock gives unlimited relative rotation.
  const lookButton = $('missionFreeLook')
  function updateLookUI() {
    pointerLocked = document.pointerLockElement === cv
    lookButton.textContent = pointerLocked ? '⎋ EXIT FREE LOOK' : '◎ FREE LOOK'
    lookButton.setAttribute('aria-pressed', String(pointerLocked)); cv.style.cursor = pointerLocked ? 'none' : 'grab'
  }
  document.addEventListener('pointerlockchange', updateLookUI)
  document.addEventListener('pointerlockerror', () => { lookButton.textContent = 'FREE LOOK UNAVAILABLE' })
  lookButton.addEventListener('click', () => document.pointerLockElement === cv ? document.exitPointerLock() : cv.requestPointerLock?.())

  // ---------- Input: sky map ----------
  function skyPick(e) {
    const b = sky.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top
    let best = null, bd = 9
    for (const p of skyPts) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p } }
    return { best, x, y }
  }
  sky.addEventListener('pointerdown', e => { sky.setPointerCapture(e.pointerId); sdrag = { x: e.clientX, y: e.clientY, moved: false } })
  sky.addEventListener('pointermove', e => {
    if (sdrag) {
      const dx = e.clientX - sdrag.x, dy = e.clientY - sdrag.y
      if (Math.hypot(dx, dy) > 1) sdrag.moved = true
      if (sz > 1) { spx += dx; spy += dy }
      sdrag.x = e.clientX; sdrag.y = e.clientY; return draw()
    }
    const { best, x, y } = skyPick(e), c = fromScreen(x, y)
    if (c) $('readout').textContent = 'RA ' + (c[0] / 15).toFixed(2) + 'h (' + c[0].toFixed(1) + '°) · Dec ' + c[1].toFixed(1) + '°'
    if (best !== skyHot) { skyHot = best; draw() }
  })
  sky.addEventListener('pointerup', e => {
    if (sdrag && !sdrag.moved) { const { best } = skyPick(e); if (best) best.kind === 'gal' ? select(best.ob) : select(best.ob, best.kind) }
    sdrag = null
  })
  sky.addEventListener('pointercancel', () => { sdrag = null })
  sky.addEventListener('wheel', e => {
    e.preventDefault()
    const b = sky.getBoundingClientRect(), sx = e.clientX - b.left - W / 2, sy = e.clientY - b.top - H / 2
    const z2 = Math.max(1, Math.min(60, sz * Math.exp(-e.deltaY * .001))), k = z2 / sz
    spx = sx - k * (sx - spx); spy = sy - k * (sy - spy); sz = z2; if (sz <= 1) spx = spy = 0
    draw()
  }, { passive: false })

  // ---------- Viewport tools ----------
  let viewHelp3d = null
  function setSky(on) {
    state.sky = on
    if (!viewHelp3d) viewHelp3d = $('viewHelp').innerHTML
    $('viewHelp').innerHTML = on ? '<strong>All-sky map · equatorial J2000</strong><br>Whole sky flattened, RA increasing to the left · drag to pan · scroll to zoom · click a dot for details' : viewHelp3d
    cv.hidden = on; sky.hidden = !on
    $('missionSky').textContent = on ? '◈ 3D VIEW' : '◐ SKY MAP'; lookButton.hidden = on
    draw(); emit('view', state)
  }
  $('missionSky').onclick = () => setSky(!state.sky)
  $('missionAscii').onclick = e => { state.ascii = !state.ascii; e.currentTarget.setAttribute('aria-pressed', String(state.ascii)); draw() }
  $('missionFullscreen').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('scene').requestFullscreen?.()
  $('missionGuide').onclick = () => setLayer('axes', !state.layers.axes)
  addEventListener('resize', resize)

  // ---------- API used by panels ----------
  function select(ob, kind = 'gal') {
    selected = kind === 'gal' ? ob : null
    if (kind === 'gal' && ob.r > state.radius) setRadius(Math.min(2000, Math.max(.15, ob.r * 1.15)))
    draw(); emit('select', { ob, kind })
  }
  function align(ob) {
    const [x, y, z] = ob.xyz
    yaw = -Math.atan2(y, x); pitch = Math.atan2(z, Math.hypot(x, y)); zoom = 1.25; ox = oy = 0
    select(ob)
  }
  function setRadius(r) { state.radius = r; draw(); emit('view', state) }
  function resetView() { yaw = .56; pitch = -.26; zoom = 1; ox = oy = 0; setRadius(1.5) }
  function setLayer(name, on) { state.layers[name] = on; draw(); emit('view', state) }
  function setOverlayOpacity(v) { state.overlayOpacity = v; if (state.sky) draw() }
  function findItem(name) { return [...data.items, ...data.imported].find(x => x.name === name) }

  async function setOverlay(key) {
    state.overlayKey = key
    const meta = data.overlays.find(o => o.key === key)
    if (!meta) { overlay = null; state.overlayNote = 'Overlays show in the sky map view.'; draw(); return emit('overlay', state) }
    state.overlayNote = 'Loading…'; emit('overlay', state)
    const img = new Image(); img.src = 'data/overlays/' + meta.file
    try { await img.decode() } catch { state.overlayNote = 'Overlay unavailable.'; return emit('overlay', state) }
    if (state.overlayKey !== key) return
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    overlay = { w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data }
    state.overlayNote = meta.note
    if (!state.sky) setSky(true); else draw()
    emit('overlay', state)
  }

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-store' })
    if (!r.ok) throw Error(path + ' ' + r.status)
    return r.json()
  }

  // Catalogs listed in data/manifest.json, published by the Mac Studio pipeline.
  let syncBusy = false
  async function syncCatalogs() {
    if (syncBusy) return
    syncBusy = true; state.syncStatus = 'Checking published catalog manifest…'; emit('sync', state)
    try {
      const root = new URL('./data/manifest.json', location.href), manifest = await getJSON(root.href)
      if (!Array.isArray(manifest.catalogs)) throw Error('Invalid manifest catalogs')
      const loaded = []
      for (const cat of manifest.catalogs) {
        if (!['gal', 'nu', 'fermi'].includes(cat.kind) || typeof cat.path !== 'string') continue
        const url = new URL(cat.path, root)
        if (url.origin !== root.origin) throw Error('Off-origin catalog URL refused')
        const resp = await fetch(url.href, { cache: 'no-store' })
        if (!resp.ok) throw Error(cat.kind + ' CSV ' + resp.status)
        const rows = parseCSV(await resp.text())
        if (cat.kind === 'gal') {
          data.imported = rows.filter(x => Number.isFinite(x.mpc) && x.mpc >= 0 && x.mpc <= 14000 && (Number.isNaN(x.z) || Number.isNaN(x.zwarn) || x.zwarn === 0))
            .slice(0, 80000).map(x => item(x.name, x.ra, x.dec, x.mpc, 'major', 'Published catalog ' + (cat.label || cat.path), x.z))
        } else if (cat.kind === 'nu') data.neutrinos = rows.slice(0, 30000)
        else data.fermi = rows.slice(0, 15000)
        loaded.push(cat.kind + ': ' + rows.length.toLocaleString())
      }
      state.lastSync = new Date()
      state.syncStatus = 'Last sync ' + state.lastSync.toLocaleTimeString() + ' — ' + (loaded.join(' · ') || 'No datasets listed')
      draw(); emit('data', data)
    } catch (e) { state.syncStatus = 'Auto-sync pending: ' + e.message }
    finally { syncBusy = false; emit('sync', state) }
  }

  async function load() {
    const curated = await getJSON('data/curated.json')
    data.items = curated.map(g => item(g.name, g.ra, g.dec, g.kpc / 1000, g.type))
    resize()
    const optional = (path, key) => getJSON(path).then(v => { data[key] = v; emit('data', data) }).catch(() => emit('data', data))
    optional('data/overlays/overlays.json', 'overlays')
    optional('data/targets.json', 'targets')
    optional('data/bootes_analysis.json', 'repro')
    if (location.protocol.startsWith('http')) syncCatalogs()
    else { state.syncStatus = 'Offline file preview: automatic sync requires hosting over HTTP(S).'; emit('sync', state) }
    emit('data', data)
  }

  return {
    state, data, on: (type, fn) => bus.addEventListener(type, e => fn(e.detail)),
    get selected() { return selected }, load, draw, select, align, setRadius, resetView, setLayer, setOverlay, setOverlayOpacity,
    syncCatalogs, findItem, setSky, item,
  }
}
