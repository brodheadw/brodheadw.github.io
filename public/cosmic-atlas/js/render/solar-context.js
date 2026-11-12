import * as THREE from 'three'
import { eclipticToEquatorial, OORT_CLOUD } from '../astro/solar.js'
import { AU_MPC } from '../astro/units.js'

/** Physical reference curves; the Oort shells are a schematic, never a point catalog. */
export function createSolarContext() {
  const group = new THREE.Group(), curves = [], labels = []
  function curve(points, color, opacity, kind) {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.length * 3), 3))
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    const line = new THREE.Line(geometry, material); line.frustumCulled = false
    group.add(line); curves.push({ line, points, opacity, kind })
  }
  for (const radius of [.4, 1, 5, 30]) {
    const points = Array.from({ length: 129 }, (_, i) => eclipticToEquatorial([radius * Math.cos(i * Math.PI / 64) * AU_MPC, radius * Math.sin(i * Math.PI / 64) * AU_MPC, 0]))
    curve(points, '#52646c', .13, 'ecliptic')
  }
  for (const radius of OORT_CLOUD.displayShellsAU) {
    for (let axis = 0; axis < 3; axis++) curve(Array.from({ length: 129 }, (_, i) => {
      const a = radius * Math.cos(i * Math.PI / 64) * AU_MPC, b = radius * Math.sin(i * Math.PI / 64) * AU_MPC
      return axis === 0 ? [0, a, b] : axis === 1 ? [a, 0, b] : [a, b, 0]
    }), '#718a9c', radius === 5000 ? .18 : .12, 'oort')
  }
  return {
    group,
    update({ relative, project, distance, visible, opacity, width, height }) {
      labels.length = 0
      const au = distance / AU_MPC, oort = visible && au >= 1000 && au <= 400000
      group.visible = visible
      for (const { line, points, opacity: base, kind } of curves) {
        line.visible = kind === 'oort' ? oort : visible && au >= .2 && au <= 300
        line.material.opacity = base * opacity
        if (!line.visible) continue
        const buffer = line.geometry.attributes.position
        points.forEach((point, i) => relative(point, buffer.array, i * 3)); buffer.needsUpdate = true
      }
      if (oort) for (const radius of OORT_CLOUD.displayShellsAU) labels.push({ x: width / 2, y: height / 2, screenNote: true, key: `oort:${radius}`, name: `${radius.toLocaleString('en-US')} AU · Oort Cloud schematic`, title: `${OORT_CLOUD.note} Reference boundary may be outside the current view.`, color: '#8497ab', priority: 30 })
    },
    labels: () => labels,
    dispose() { for (const { line } of curves) { line.geometry.dispose(); line.material.dispose() } },
  }
}
