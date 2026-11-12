import * as THREE from 'three'
import { palette, fermiColor } from '../palette.js'
import { frameAt } from '../astro/satellites.js'
import { getSkyGuides, milkyWayDisk, getDistanceShells } from './guides.js'
import { pointCloud, encodePickId } from './points.js'
import { createSky, createMapBackground, direction, hammer, skyCircle } from './sphere.js'
import { createLabels } from './labels.js'
import { createPicker } from './picking.js'
import { createAsciiPass } from './postfx/ascii.js'

export const MPC_KM = 3.0856775814913673e19
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const vector = new THREE.Vector3()
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function createScene({ container, store, onSelect, onHover, onMetrics }) {
  const canvas = document.createElement('canvas'); canvas.id = 'universe'; canvas.setAttribute('aria-label', 'Interactive cosmic atlas. Use search to select objects and keyboard controls to navigate.'); canvas.tabIndex = 0
  container.prepend(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(palette.bg)
  renderer.autoClear = false
  const universe = new THREE.Scene(), sky = new THREE.Scene(), map = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, 1, .00001, 1e7)
  camera.up.set(0, 0, 1)
  const skyCamera = new THREE.PerspectiveCamera(55, 1, .01, 100)
  const mapCamera = new THREE.OrthographicCamera(-3.1, 3.1, 1.55, -1.55, .01, 100)
  mapCamera.position.z = 10
  const blank = new THREE.DataTexture(new Uint8Array([6, 10, 17, 255]), 1, 1); blank.needsUpdate = true
  const uniforms = { skyA: { value: blank }, skyB: { value: blank }, opacityA: { value: 0 }, opacityB: { value: 0 }, backgroundColor: { value: new THREE.Color(palette.bg) } }
  sky.add(createSky(uniforms)); map.add(createMapBackground(uniforms))
  const ascii = createAsciiPass(renderer), labels = createLabels(container, onSelect)
  const picker = createPicker(renderer, [universe, sky, map])
  const textureLoader = new THREE.TextureLoader(), textures = new Map(), handles = new Map(), pickIds = new Map(), pickLookup = new Map()
  let nextId = 1, width = 1, height = 1, frameId, dirty = true, running = true, lastLabels = 0, lastMetrics = performance.now(), frames = 0, renderMs = 0
  let state = store.getState(), rig = structuredClone(state.camera), goal = state.camera, mapZoom = 1, mapPan = [0, 0]
  let solarBodies = [], satellites = null, orbitLines = [], hovered = null, guides = [], selectedRing = null
  let cameraMoving = false, lastTime = performance.now(), lastPrepared = '', solarDirty = false
  const keys = new Set(), pointers = new Map()

  function allocId(layer, id) { const name = `${layer}:${id}`; if (pickLookup.has(name)) return pickLookup.get(name); if (nextId > 0xffffff) throw Error('Point-picking ID capacity exceeded'); const key = nextId++; pickLookup.set(name, key); pickIds.set(key, { layer, id }); return key }
  function layerState(id) { return state.layers[id] || { visible: false, opacity: 1, filters: {} } }
  function radial(position) {
    if (!state.camera.log) return position
    const r = Math.hypot(...position)
    if (!r) return position
    const k = .001 * Math.log1p(r / .001) / r
    return position.map(v => v * k)
  }
  function displayScale() {
    if (!state.camera.log) return rig.distance
    const r = Math.hypot(...rig.target)
    return Math.max(1e-18, .001 * Math.log1p((r + rig.distance) / .001) - .001 * Math.log1p(r / .001))
  }
  let frameOrigin = radial(rig.target), frameScale = displayScale()
  function relative(position, output, offset = 0) {
    const p = radial(position), origin = frameOrigin, scale = frameScale
    output[offset] = (p[0] - origin[0]) / scale; output[offset + 1] = (p[1] - origin[1]) / scale; output[offset + 2] = (p[2] - origin[2]) / scale
  }
  function addTable(layer, table) {
    handles.get(layer.id)?.dispose()
    const count = table.length, cloud = pointCloud(count, { color: layer.style?.color || palette[layer.id] || palette.major, size: layer.style?.size || (layer.id === 'curated' ? 7 : 3) })
    const flat = pointCloud(count, { color: layer.style?.color || palette[layer.id] || palette.major, size: layer.style?.size || 3 })
    flat.material.uniforms.fade.value = 0
    if (layer.kind === 'directions') cloud.material.uniforms.fade.value = 0
    const physical = new Float64Array(count * 3), rings = new THREE.Group(), flatRings = new THREE.Group()
    const c = table.columns
    for (let i = 0; i < count; i++) {
      direction(c.ra[i], c.dec[i], layer.kind === 'directions' ? 1 : c.mpc[i]).forEach((x, k) => { physical[i * 3 + k] = x })
      flat.positions.set(hammer(c.ra[i], c.dec[i]), i * 3)
      const pickId = allocId(layer.id, i); encodePickId(pickId, cloud.ids, i * 3); encodePickId(pickId, flat.ids, i * 3)
      if (layer.id === 'fermi') { const color = new THREE.Color(fermiColor(table.strings.cls?.[i])); color.toArray(cloud.colors, i * 3); color.toArray(flat.colors, i * 3) }
      if (layer.id === 'curated') {
        const type = table.strings.type?.[i], color = new THREE.Color(palette[type] || palette.dwarf)
        color.toArray(cloud.colors, i * 3); color.toArray(flat.colors, i * 3)
        cloud.sizes[i] = flat.sizes[i] = type === 'observer' ? 0 : type === 'target' ? 11 : type === 'major' ? 8 : 5
      }
      if (layer.kind === 'directions' && layer.id === 'neutrinos' && c.err?.[i] > 0 && c.err[i] < 45) {
        const circle = skyCircle(c.ra[i], c.dec[i], c.err[i])
        rings.add(makeLine(circle.map(([a, d]) => direction(a, d)), palette.neutrinos, .28))
        const pairs = []
        for (let k = 1; k < circle.length; k++) {
          const a = hammer(...circle[k - 1]), b = hammer(...circle[k])
          if (Math.abs(a[0] - b[0]) < 1) pairs.push(a, b)
        }
        flatRings.add(makeLine(pairs, palette.neutrinos, .3, true))
        rings.children.at(-1).userData.row = i; flatRings.children.at(-1).userData.row = i
      }
    }
    cloud.geometry.attributes.color.needsUpdate = true; flat.geometry.attributes.color.needsUpdate = true
    cloud.geometry.attributes.pickColor.needsUpdate = true; flat.geometry.attributes.pickColor.needsUpdate = true
    const parent = layer.kind === 'directions' ? sky : universe
    parent.add(cloud.points); parent.add(rings); map.add(flat.points, flatRings)
    const h = { layer, table, cloud, flat, physical, indices: Uint32Array.from({ length: count }, (_, i) => i), indexSet: null, rings, flatRings,
      dispose() { parent.remove(cloud.points, rings); map.remove(flat.points, flatRings); cloud.dispose(); flat.dispose(); disposeGroup(rings); disposeGroup(flatRings) } }
    handles.set(layer.id, h); dirty = true
    return { update: () => { dirty = true }, dispose: () => { h.dispose(); handles.delete(layer.id) } }
  }
  function makeLine(points, color, opacity = .35, segments = false) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)))
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    return new (segments ? THREE.LineSegments : THREE.Line)(geometry, material)
  }
  function disposeGroup(group) { group.traverse(o => { o.geometry?.dispose(); o.material?.dispose() }); group.clear() }
  function setIndices(id, indices) {
    const h = handles.get(id); if (!h) return
    h.indices = indices; h.indexSet = new Set(indices)
    h.cloud.geometry.setIndex(new THREE.BufferAttribute(indices, 1)); h.flat.geometry.setIndex(new THREE.BufferAttribute(indices, 1)); dirty = true
  }
  async function setTexture(layer) {
    if (textures.has(layer.id)) return
    textures.set(layer.id, null)
    try {
      const texture = await textureLoader.loadAsync(layer.files.texture)
      texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping
      textures.set(layer.id, texture); dirty = true
    } catch (error) { textures.delete(layer.id); throw error }
  }
  function updateTextures() {
    const active = [...textures].filter(([id, texture]) => texture && layerState(id).visible).slice(-2)
    for (let i = 0; i < 2; i++) {
      const entry = active[i], suffix = i ? 'B' : 'A'
      uniforms['sky' + suffix].value = entry?.[1] || blank
      uniforms['opacity' + suffix].value = entry ? layerState(entry[0]).opacity : 0
    }
  }
  function prepare() {
    const key = `${rig.target}:${rig.distance}:${state.camera.log}`
    if (!dirty && !solarDirty && key === lastPrepared) return
    lastPrepared = key; updateTextures()
    for (const h of handles.values()) {
      const ls = layerState(h.layer.id)
      h.cloud.points.visible = h.flat.points.visible = h.rings.visible = h.flatRings.visible = ls.visible
      h.cloud.material.uniforms.opacity.value = h.flat.material.uniforms.opacity.value = ls.opacity
      if (!ls.visible) continue
      for (const ring of h.rings.children) ring.visible = !h.indexSet || h.indexSet.has(ring.userData.row)
      for (const ring of h.flatRings.children) ring.visible = !h.indexSet || h.indexSet.has(ring.userData.row)
      if (h.layer.kind === 'points3d') {
        for (let i = 0; i < h.table.length; i++) relative(h.physical.subarray(i * 3, i * 3 + 3), h.cloud.positions, i * 3)
        h.cloud.geometry.attributes.position.needsUpdate = true
      } else if (h.layer.kind === 'directions') {
        h.cloud.positions.set(h.physical); h.cloud.geometry.attributes.position.needsUpdate = true
      }
    }
    prepareBodies(); updateSelectionRing(); updateGuides(); dirty = false; solarDirty = false
  }
  function projectPosition(position, whichCamera = camera, skyDirection = false) {
    const coords = new Float64Array(3)
    if (state.view === 'sky') vector.set(...hammer(position.ra, position.dec))
    else if (skyDirection) vector.set(...direction(position.ra, position.dec))
    else { relative(position, coords); vector.set(...coords) }
    vector.project(whichCamera)
    return vector.z > -1 && vector.z < 1 && Math.abs(vector.x) < 1.1 && Math.abs(vector.y) < 1.1 ? { x: (vector.x + 1) * width / 2, y: (1 - vector.y) * height / 2 } : null
  }
  function updateLabels(now) {
    if (now - lastLabels < 90) return
    lastLabels = now
    const candidates = [], which = state.view === 'sky' ? mapCamera : camera
    for (const h of handles.values()) {
      if (!layerState(h.layer.id).visible) continue
      const ids = h.layer.id === 'curated' ? h.indices : [state.selection?.layer === h.layer.id ? state.selection.id : -1, hovered?.layer === h.layer.id ? hovered.id : -1]
      for (const i of ids) {
        if (i < 0 || i >= h.table.length || (h.indexSet && !h.indexSet.has(i))) continue
        const type = h.table.strings.type?.[i], chosen = state.selection?.layer === h.layer.id && state.selection.id === i
        if (type === 'observer') continue
        const isDirection = h.layer.kind === 'directions', ra = h.table.columns.ra[i], dec = h.table.columns.dec[i]
        const p = projectPosition(state.view === 'sky' || isDirection ? { ra, dec } : h.physical.subarray(i * 3, i * 3 + 3), state.view === 'sky' ? mapCamera : isDirection ? skyCamera : which, isDirection)
        if (p) candidates.push({ ...p, key: `${h.layer.id}:${i}`, layer: h.layer.id, id: i, name: h.table.strings.name[i], color: palette[type] || palette[h.layer.id] || palette.major, priority: chosen ? 200 : type === 'target' ? 150 : type === 'major' ? 80 : 20 })
      }
    }
    if (state.view !== 'sky') for (const body of solarBodies) {
      if (!bodyMeshes.get(body.id)?.visible) continue
      if (body.id !== 'earth' && bodyMeshes.get('earth')?.visible) {
        const point = new THREE.Vector3(...body.position.map(x => x / MPC_KM)), coords = new Float64Array(3)
        relative(point.toArray(), coords); point.fromArray(coords)
        const earthMesh = bodyMeshes.get('earth'), delta = point.clone().sub(camera.position), toEarth = earthMesh.position.clone().sub(camera.position)
        const t = toEarth.dot(delta) / delta.lengthSq()
        if (t > 0 && t < 1 && camera.position.clone().addScaledVector(delta, t).distanceTo(earthMesh.position) < earthMesh.scale.x) continue
      }
      const p = projectPosition(body.position.map(x => x / MPC_KM))
      if (p) candidates.push({ ...p, key: `solar:${body.id}`, layer: 'solar', id: body.id, name: body.name, color: body.id === 'sun' ? palette.sun : palette.ink, priority: state.selection?.id === body.id ? 180 : 70 })
    }
    if (state.view !== 'sky' && satellites && layerState('satellites').visible && state.selection?.layer === 'satellites') {
      const i = state.selection.index, earth = solarBodies.find(b => b.id === 'earth'), p = satellites.gcrsPositions || satellites.positions
      if (earth && p && satellites.valid?.[i]) {
        const location = [0, 1, 2].map(k => (earth.position[k] + p[i * 3 + k]) / MPC_KM), point = projectPosition(location)
        if (point) candidates.push({ ...point, key: `satellites:${i}`, layer: 'satellites', id: i, name: satelliteNames[i] || 'Selected satellite', color: palette.target, priority: 200 })
      }
    }
    labels.update(candidates, width, height, width < 600 ? 14 : 38)
  }
  const bodyMeshes = new Map(), bodyGroup = new THREE.Group(), solarOrbits = new THREE.Group(), satelliteGroup = new THREE.Group()
  universe.add(bodyGroup, solarOrbits, satelliteGroup)
  const sunlight = new THREE.PointLight(palette.ink, 2, 0, 0); universe.add(sunlight, new THREE.AmbientLight(palette.ink, .08))
  const bodyGeometry = new THREE.SphereGeometry(1, 40, 24); bodyGeometry.rotateX(Math.PI / 2)
  const day = textureLoader.load('data/textures/earth-day.jpg', () => { dirty = true }, undefined, () => {})
  day.colorSpace = THREE.SRGBColorSpace
  const lights = textureLoader.load('data/textures/earth-night.jpg', () => { dirty = true }, undefined, () => {})
  lights.colorSpace = THREE.SRGBColorSpace
  const earthMaterial = new THREE.ShaderMaterial({ uniforms: { day: { value: day }, night: { value: lights }, sunDirection: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec2 uvv;varying vec3 n;void main(){uvv=uv;n=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform sampler2D day,night;uniform vec3 sunDirection;varying vec2 uvv;varying vec3 n;void main(){float d=dot(normalize(n),normalize(sunDirection));float f=smoothstep(-.07,.07,d);vec3 c=texture2D(day,uvv).rgb*(.06+.94*max(d,0.))+texture2D(night,uvv).rgb*(1.-f)*.9;gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}' })
  let satelliteNames = [], satelliteCloud = null, satelliteIndices = null, satelliteReceived = performance.now()
  function prepareBodies() {
    const visible = layerState('solar').visible || layerState('satellites').visible || rig.distance < 2e-9
    bodyGroup.visible = visible; solarOrbits.visible = visible && state.view !== 'sky'
    const scale = displayScale(), earth = solarBodies.find(x => x.id === 'earth')
    for (const body of solarBodies) {
      let mesh = bodyMeshes.get(body.id)
      if (!mesh) {
        mesh = new THREE.Mesh(bodyGeometry, body.id === 'earth' ? earthMaterial : new (body.id === 'sun' ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)({ color: body.color || (body.id === 'sun' ? palette.sun : palette.moon) }))
        const id = allocId('solar', body.id)
        mesh.userData.pickMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color((id & 255) / 255, (id >> 8 & 255) / 255, (id >> 16 & 255) / 255) })
        bodyGroup.add(mesh); bodyMeshes.set(body.id, mesh)
      }
      const p = new Float64Array(3); relative(body.position.map(x => x / MPC_KM), p); mesh.position.fromArray(p)
      const trueRadius = body.radiusKm / MPC_KM / scale
      const displayRadius = state.bodyScale === 'true' ? trueRadius : Math.max(trueRadius, body.id === 'sun' ? .012 : .006)
      mesh.scale.setScalar(displayRadius)
      mesh.visible = visible && Math.hypot(...p) < 1e5 && Math.hypot(...body.position) / MPC_KM < Math.max(rig.distance * 1e5, 1e-7)
      if (body.id === 'earth') {
        const frame = frameAt(new Date(body.utc || Date.now())), a = frame.temeToGcrs
        const orientation = new THREE.Matrix4().set(a[0][0],a[0][1],a[0][2],0,a[1][0],a[1][1],a[1][2],0,a[2][0],a[2][1],a[2][2],0,0,0,0,1).multiply(new THREE.Matrix4().makeRotationZ(frame.gmst))
        mesh.quaternion.setFromRotationMatrix(orientation)
        earthMaterial.uniforms.sunDirection.value.fromArray(body.position).multiplyScalar(-1).normalize()
      }
    }
    const sunPosition = new Float64Array(3); relative([0, 0, 0], sunPosition); sunlight.position.fromArray(sunPosition)
    if (satelliteCloud && satellites && earth) {
      satelliteGroup.visible = layerState('satellites').visible
      const positions = satellites.gcrsPositions || satellites.positions
      for (let i = 0; i < positions.length / 3; i++) {
        const physical = [0, 1, 2].map(k => (earth.position[k] + positions[i * 3 + k]) / MPC_KM)
        relative(physical, satelliteCloud.positions, i * 3)
      }
      const velocities = satelliteCloud.geometry.attributes.velocity.array
      if (satellites.velocities) for (let i = 0; i < positions.length / 3; i++) for (let k = 0; k < 3; k++) velocities[i * 3 + k] = (satellites.velocities[i * 3 + k] || 0) / MPC_KM / scale
      satelliteCloud.geometry.attributes.velocity.needsUpdate = true
      satelliteCloud.geometry.attributes.position.needsUpdate = true
      satelliteCloud.material.uniforms.opacity.value = layerState('satellites').opacity
    }
    for (const line of orbitLines) {
      const coords = line.userData.physical, relativePositions = line.geometry.attributes.position.array
      for (let i = 0; i < coords.length / 3; i++) {
        const p = coords.subarray(i * 3, i * 3 + 3)
        relative(line.userData.geocentric && earth ? [0, 1, 2].map(k => (earth.position[k] + p[k]) / MPC_KM) : Array.from(p, x => x / MPC_KM), relativePositions, i * 3)
      }
      line.geometry.attributes.position.needsUpdate = true
    }
  }
  function setSolarBodies(bodies) { solarBodies = bodies; solarDirty = true }
  function setSatellites(payload, metadata = []) {
    satellites = payload; satelliteNames = metadata.map(s => s.name); satelliteReceived = performance.now()
    if (!payload) {
      if (satelliteCloud) { satelliteGroup.remove(satelliteCloud.points); satelliteCloud.dispose(); satelliteCloud = null }
      satelliteIndices = null; solarDirty = true; return
    }
    const positions = payload.gcrsPositions || payload.positions
    if (!positions) return
    const count = positions.length / 3
    if (!satelliteCloud || satelliteCloud.positions.length !== positions.length) {
      if (satelliteCloud) { satelliteGroup.remove(satelliteCloud.points); satelliteCloud.dispose() }
      satelliteCloud = pointCloud(count, { color: palette.accent, size: 3 }); satelliteGroup.add(satelliteCloud.points)
      for (let i = 0; i < count; i++) {
        encodePickId(allocId('satellites', i), satelliteCloud.ids, i * 3)
        const type = metadata[i]?.OBJECT_TYPE || metadata[i]?.objectType
        new THREE.Color(type === 'DEB' || type === 'DEBRIS' ? palette.fermi : type === 'R/B' || type === 'ROCKET BODY' ? palette.target : palette.accent).toArray(satelliteCloud.colors, i * 3)
      }
      satelliteCloud.geometry.attributes.pickColor.needsUpdate = true; satelliteCloud.geometry.attributes.color.needsUpdate = true
    }
    if (satelliteIndices) setSatelliteIndices(satelliteIndices)
    else if (payload.valid) satelliteCloud.geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(Array.from({ length: count }, (_, i) => i).filter(i => payload.valid[i])), 1))
    solarDirty = true
  }
  function setSatelliteIndices(indices) { satelliteIndices = indices; if (satelliteCloud) { const valid = satellites?.valid ? indices.filter(i => satellites.valid[i]) : indices; satelliteCloud.geometry.setIndex(new THREE.BufferAttribute(valid, 1)) }; dirty = true }
  function setOrbitPaths(paths) {
    for (const line of orbitLines) { universe.remove(line); line.geometry.dispose(); line.material.dispose() }
    orbitLines = paths.map(path => {
      const line = makeLine(Array.from({ length: path.positions.length / 3 }, () => [0, 0, 0]), path.color || palette.accent, .5)
      line.userData.physical = Float64Array.from(path.positions); line.userData.geocentric = path.geocentric
      universe.add(line); return line
    }); solarDirty = true
  }
  function updateSelectionRing() {
    if (selectedRing) { selectedRing.parent?.remove(selectedRing); selectedRing.geometry.dispose(); selectedRing.material.dispose(); selectedRing = null }
    const s = state.selection, h = handles.get(s?.layer)
    if (!h || !layerState(s.layer).visible || s.id >= h.table.length || s.id < 0) return
    const c = h.table.columns, ra = c.ra[s.id], dec = c.dec[s.id], isSky = state.view === 'sky'
    if (h.layer.kind === 'directions' || isSky) {
      const pts = skyCircle(ra, dec, Math.max(c.err?.[s.id] || 0, 1))
      const positions = []
      if (isSky) { for (let i = 1; i < pts.length; i++) { const a = hammer(...pts[i - 1]), b = hammer(...pts[i]); if (Math.abs(a[0] - b[0]) < 1) positions.push(a, b) } } else positions.push(...pts.map(p => direction(...p)))
      selectedRing = makeLine(positions, palette.target, 1, isSky)
      ;(isSky ? map : sky).add(selectedRing)
    } else {
      const p = new Float64Array(3); relative(h.physical.subarray(s.id * 3, s.id * 3 + 3), p)
      const coords = Array.from({ length: 65 }, (_, i) => {
        const a = i / 64 * Math.PI * 2
        return new THREE.Vector3(Math.cos(a) * .022, Math.sin(a) * .022, 0).applyQuaternion(camera.quaternion).add(new THREE.Vector3(...p)).toArray()
      })
      selectedRing = makeLine(coords, palette.target, 1); universe.add(selectedRing)
    }
  }
  function updateGuides() {
    for (const item of guides) { item.parent?.remove(item); item.geometry.dispose(); item.material.dispose() }
    guides = []
    if (!state.guides) return
    const references = { equatorial: true, galactic: false, supergalactic: false, galacticPlane: true, ecliptic: true, disk: true, shells: true, ...(state.references || {}) }
    for (const guide of getSkyGuides()) {
      if (!references[guide.frame] && !(guide.frame === 'galactic' && guide.latitude === 0 && references.galacticPlane)) continue
      const isMap = state.view === 'sky', points = []
      if (isMap) {
        for (let i = 1; i < guide.points.length; i++) {
          const a = hammer(...guide.points[i - 1]), b = hammer(...guide.points[i])
          if (Math.abs(a[0] - b[0]) < 1) points.push(a, b)
        }
      } else points.push(...guide.points.map(p => direction(...p)))
      const line = makeLine(points, guide.color, guide.latitude === 0 ? .35 : .1, isMap)
      ;(isMap ? map : sky).add(line); guides.push(line)
    }
    if (state.view === 'sky') return
    for (const shell of references.shells ? getDistanceShells() : []) {
      if (shell.radiusMpc / rig.distance < .05 || shell.radiusMpc / rig.distance > 20) continue
      for (const ring of shell.rings) {
        const coords = ring.map(v => { const p = new Float64Array(3); relative(v, p); return [...p] })
        const line = makeLine(coords, palette.grid, .25); universe.add(line); guides.push(line)
      }
    }
    const disk = makeLine(milkyWayDisk().map(v => { const p = new Float64Array(3); relative(v, p); return [...p] }), palette.dwarf, .35)
    if (references.disk) { universe.add(disk); guides.push(disk) } else { disk.geometry.dispose(); disk.material.dispose() }
  }

  function resize() {
    const rect = container.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height)
    renderer.setSize(width, height); camera.aspect = skyCamera.aspect = width / height
    camera.updateProjectionMatrix(); skyCamera.updateProjectionMatrix()
    const aspect = width / height, halfY = Math.max(1.6, 3.05 / aspect) / mapZoom
    mapCamera.left = -halfY * aspect + mapPan[0]; mapCamera.right = halfY * aspect + mapPan[0]
    mapCamera.top = halfY + mapPan[1]; mapCamera.bottom = -halfY + mapPan[1]; mapCamera.updateProjectionMatrix()
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()); ascii.resize(size.x, size.y); dirty = true
  }
  const observer = new ResizeObserver(resize); observer.observe(container)
  const unsubscribe = store.subscribe(next => { state = next; goal = next.camera; dirty = true })
  function pick(e) {
    const rect = canvas.getBoundingClientRect(), passes = state.view === 'sky' ? [{ scene: map, camera: mapCamera }] : [{ scene: sky, camera: skyCamera }, { scene: universe, camera }]
    return pickIds.get(picker.pick(e.clientX - rect.left, e.clientY - rect.top, width, height, passes)) || null
  }
  let dragMoved = false, lastPointer = null, hoverTime = 0
  canvas.addEventListener('pointerdown', e => { canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); dragMoved = false; lastPointer = [e.clientX, e.clientY] })
  canvas.addEventListener('pointermove', e => {
    if (document.pointerLockElement === canvas) {
      store.set({ camera: { yaw: goal.yaw - e.movementX * .004, pitch: clamp(goal.pitch + e.movementY * .004, -1.55, 1.55) } }, { history: false }); return
    }
    if (pointers.has(e.pointerId)) {
      const old = pointers.get(e.pointerId), dx = e.clientX - old[0], dy = e.clientY - old[1]
      if (Math.hypot(dx, dy) > 1) dragMoved = true
      if (pointers.size > 1) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1]
        if (other) { const before = Math.hypot(old[0] - other[0], old[1] - other[1]), after = Math.hypot(e.clientX - other[0], e.clientY - other[1]); if (after > 1 && before > 1) zoom(Math.log(before / after), e) }
      } else if (state.view === 'sky') { mapPan[0] -= dx / width * (mapCamera.right - mapCamera.left); mapPan[1] += dy / height * (mapCamera.top - mapCamera.bottom); resize() }
      else store.set({ camera: { yaw: goal.yaw - dx * .005, pitch: clamp(goal.pitch + dy * .005, -1.55, 1.55) } }, { history: false })
      pointers.set(e.pointerId, [e.clientX, e.clientY]); lastPointer = [e.clientX, e.clientY]
    } else if (performance.now() - hoverTime > 120) {
      hoverTime = performance.now(); hovered = pick(e); onHover?.(hovered, e); dirty = true
    }
  })
  canvas.addEventListener('pointerup', e => { if (!dragMoved && pointers.size === 1 && document.pointerLockElement !== canvas) { const p = pick(e); if (p) onSelect(p.layer, p.id) }; pointers.delete(e.pointerId); lastPointer = null })
  canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); lastPointer = null })
  function zoom(delta, event) {
    if (state.view === 'sky') { mapZoom = clamp(mapZoom * Math.exp(-delta), 1, 40); if (mapZoom === 1) mapPan = [0, 0]; resize(); return }
    let minimum = 100 / MPC_KM
    for (const body of solarBodies) { const distanceKm = Math.hypot(...body.position.map((x, k) => x - goal.target[k] * MPC_KM)); if (distanceKm < body.radiusKm) minimum = Math.max(minimum, (body.radiusKm - distanceKm + 100) / MPC_KM) }
    const next = clamp(goal.distance * Math.exp(delta), minimum, 1000), target = [...goal.target]
    if (event) {
      const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / width * 2 - 1, y = 1 - (event.clientY - rect.top) / height * 2
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      const amount = (goal.distance - next) * Math.tan(55 * Math.PI / 360)
      for (let k = 0; k < 3; k++) target[k] += (right.getComponent(k) * x * camera.aspect + up.getComponent(k) * y) * amount
    }
    store.set({ camera: { distance: next, target, mode: 'orbit' } }, { history: false })
  }
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(clamp(e.deltaY * .0015, -.8, .8), e) }, { passive: false })
  canvas.addEventListener('keydown', e => { if (['w', 'a', 's', 'd', 'q', 'e', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(e.key.toLowerCase())) { e.preventDefault(); keys.add(e.key.toLowerCase()) } })
  canvas.addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); canvas.addEventListener('blur', () => keys.clear())
  function moveKeys(dt) {
    if (!keys.size || state.view === 'sky') return
    const target = [...goal.target], right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const move = new THREE.Vector3(), speed = goal.distance * dt * (keys.has('shift') ? 1 : .4)
    if (keys.has('w') || keys.has('arrowup')) move.add(forward)
    if (keys.has('s') || keys.has('arrowdown')) move.sub(forward)
    if (keys.has('a') || keys.has('arrowleft')) move.sub(right)
    if (keys.has('d') || keys.has('arrowright')) move.add(right)
    if (keys.has('q')) move.z -= 1; if (keys.has('e')) move.z += 1
    move.multiplyScalar(speed); for (let k = 0; k < 3; k++) target[k] += move.getComponent(k)
    store.set({ camera: { target, mode: 'fly' } }, { history: false })
    if (keys.has('+') || keys.has('=')) zoom(-dt)
    if (keys.has('-')) zoom(dt)
  }
  function render(now) {
    if (!running) return
    frameId = requestAnimationFrame(render)
    const start = performance.now(), dt = Math.min(.1, (now - lastTime) / 1000); lastTime = now
    moveKeys(dt)
    const alpha = reducedMotion() ? 1 : 1 - Math.exp(-dt * 11)
    cameraMoving = false
    const desiredTarget = [...goal.target]
    if (goal.mode === 'follow' && state.selection?.layer === 'satellites' && satellites?.valid?.[state.selection.index]) {
      const i = state.selection.index, elapsed = state.clock.paused ? 0 : clamp((now - satelliteReceived) / 1000 * state.clock.rate, -5, 5)
      for (let k = 0; k < 3; k++) desiredTarget[k] += (satellites.velocities[i * 3 + k] || 0) * elapsed / MPC_KM
    }
    for (let k = 0; k < 3; k++) { const d = desiredTarget[k] - rig.target[k]; if (Math.abs(d) > goal.distance * 1e-6) cameraMoving = true; rig.target[k] += d * alpha }
    const delta = Math.log(goal.distance / rig.distance); if (Math.abs(delta) > 1e-6) cameraMoving = true
    rig.distance *= Math.exp(delta * alpha); rig.yaw += (goal.yaw - rig.yaw) * alpha; rig.pitch += (goal.pitch - rig.pitch) * alpha
    camera.position.set(Math.cos(rig.pitch) * Math.cos(rig.yaw), Math.cos(rig.pitch) * Math.sin(rig.yaw), Math.sin(rig.pitch))
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    skyCamera.quaternion.copy(camera.quaternion); skyCamera.updateMatrixWorld()
    frameOrigin = radial(rig.target); frameScale = displayScale()
    prepare()
    if (satelliteCloud) satelliteCloud.material.uniforms.timeOffset.value = state.clock.paused ? 0 : clamp((now - satelliteReceived) / 1000 * state.clock.rate, -5, 5)
    renderer.setRenderTarget(state.ascii ? ascii.target : null); renderer.setClearColor(palette.bg); renderer.clear()
    if (state.view === 'sky') renderer.render(map, mapCamera)
    else { renderer.render(sky, skyCamera); renderer.clearDepth(); renderer.render(universe, camera) }
    if (state.ascii) ascii.render()
    updateLabels(now)
    frames++; renderMs += performance.now() - start
    if (now - lastMetrics > 1000) {
      onMetrics?.({ fps: frames * 1000 / (now - lastMetrics), frameMs: renderMs / frames, points: renderer.info.render.points, calls: renderer.info.render.calls, distance: rig.distance, moving: cameraMoving })
      frames = 0; renderMs = 0; lastMetrics = now
    }
  }
  resize(); frameId = requestAnimationFrame(render)
  return {
    canvas, renderer, addTable, setIndices, setTexture, setSolarBodies, setSatellites, setSatelliteIndices, setOrbitPaths,
    focus(position, distance) { store.set({ camera: { target: Array.from(position), distance: clamp(distance, 100 / MPC_KM, 1000), mode: 'orbit' } }) },
    lookAtDirection(ra, dec) { const d = direction(ra, dec); store.set({ camera: { yaw: Math.atan2(-d[1], -d[0]), pitch: -Math.asin(d[2]) } }) },
    freeLook() { canvas.requestPointerLock?.() },
    getRig: () => ({ ...rig, target: [...rig.target] }),
    dispose() { running = false; cancelAnimationFrame(frameId); unsubscribe(); observer.disconnect(); for (const h of handles.values()) h.dispose(); for (const t of textures.values()) t?.dispose(); bodyGeometry.dispose(); earthMaterial.dispose(); day.dispose(); lights.dispose(); blank.dispose(); ascii.dispose(); picker.dispose(); labels.dispose(); renderer.dispose(); canvas.remove() },
  }
}
