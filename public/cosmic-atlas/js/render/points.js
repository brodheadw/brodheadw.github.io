import * as THREE from 'three'

const vertex = `attribute float pointSize;attribute vec3 pickColor;attribute vec3 velocity;varying vec3 tint;varying vec3 idColor;varying float depthFade;
uniform float opacity;uniform float timeOffset;uniform float fade;void main(){tint=color;idColor=pickColor;vec4 mv=modelViewMatrix*vec4(position+velocity*timeOffset,1.);
depthFade=mix(1.,1./(1.+.08*pow(abs(mv.z),1.4)),fade);gl_Position=projectionMatrix*mv;gl_PointSize=pointSize;}`
export function pointCloud(count, { color = '#65baff', size = 3, opacity = 1 } = {}) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), ids = new Float32Array(count * 3)
  const sizes = new Float32Array(count).fill(size), c = new THREE.Color(color)
  for (let i = 0; i < count; i++) c.toArray(colors, i * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('velocity', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('pickColor', new THREE.BufferAttribute(ids, 3))
  geometry.setAttribute('pointSize', new THREE.BufferAttribute(sizes, 1))
  const material = new THREE.ShaderMaterial({ uniforms: { opacity: { value: opacity }, timeOffset: { value: 0 }, fade: { value: 1 } }, vertexColors: true, transparent: true, depthWrite: false,
    vertexShader: vertex,
    fragmentShader: `varying vec3 tint;varying float depthFade;uniform float opacity;uniform float timeOffset;uniform float fade;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;
    gl_FragColor=vec4(tint,opacity*depthFade*smoothstep(.5,.18,r));
    #include <colorspace_fragment>
    }` })
  const pickMaterial = new THREE.ShaderMaterial({ uniforms: material.uniforms, vertexColors: true, vertexShader: vertex,
    fragmentShader: 'varying vec3 idColor;varying float depthFade;void main(){if(length(gl_PointCoord-.5)>.5)discard;gl_FragColor=vec4(idColor,1.);}' })
  const points = new THREE.Points(geometry, material); points.frustumCulled = false
  points.userData.pickMaterial = pickMaterial
  return { points, positions, colors, ids, sizes, geometry, material, dispose() { geometry.dispose(); material.dispose(); pickMaterial.dispose() } }
}

export function encodePickId(id, array, offset) {
  array[offset] = (id & 255) / 255; array[offset + 1] = (id >> 8 & 255) / 255; array[offset + 2] = (id >> 16 & 255) / 255
}
