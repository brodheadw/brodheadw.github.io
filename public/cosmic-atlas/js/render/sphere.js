import * as THREE from 'three'

export const skyFragment = `uniform sampler2D skyA,skyB;uniform float opacityA,opacityB;uniform vec3 backgroundColor;varying vec3 direction;
vec3 skyColor(vec3 d){d=normalize(d);float ra=atan(d.y,d.x);vec2 t=vec2(fract(1.-ra/6.28318530718),asin(clamp(d.z,-1.,1.))/3.14159265359+.5);
vec3 c=backgroundColor;c=mix(c,texture2D(skyA,t).rgb,opacityA);return mix(c,texture2D(skyB,t).rgb,opacityB);}`

export function createSky(uniforms) {
  const material = new THREE.ShaderMaterial({ uniforms, depthWrite: false, depthTest: false, side: THREE.BackSide,
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: skyFragment + 'void main(){gl_FragColor=vec4(skyColor(direction),1.);\n#include <colorspace_fragment>\n}' })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), material); mesh.renderOrder = -100
  mesh.userData.noPick = true
  return mesh
}

export function createMapBackground(uniforms) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.656854249, 2.828427124), new THREE.ShaderMaterial({ uniforms,
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: skyFragment + `void main(){vec2 p=direction.xy;if(p.x*p.x/8.+p.y*p.y/2.>1.)discard;
    float z=sqrt(max(0.,1.-p.x*p.x/16.-p.y*p.y/4.));float l=2.*atan(z*p.x,2.*(2.*z*z-1.));
    float dec=asin(clamp(z*p.y,-1.,1.));float ra=3.14159265359-l;
    gl_FragColor=vec4(skyColor(vec3(cos(dec)*cos(ra),cos(dec)*sin(ra),sin(dec))),1.);
    #include <colorspace_fragment>
    }` }))
  mesh.renderOrder = -100; mesh.userData.noPick = true
  return mesh
}

export function direction(ra, dec, radius = 1) {
  const a = ra * Math.PI / 180, d = dec * Math.PI / 180
  return [Math.cos(d) * Math.cos(a) * radius, Math.cos(d) * Math.sin(a) * radius, Math.sin(d) * radius]
}

export function hammer(ra, dec) {
  const l = (((180 - ra) % 360 + 540) % 360 - 180) * Math.PI / 180, d = dec * Math.PI / 180
  const z = Math.sqrt(1 + Math.cos(d) * Math.cos(l / 2))
  return [2 * Math.SQRT2 * Math.cos(d) * Math.sin(l / 2) / z, Math.SQRT2 * Math.sin(d) / z, 0]
}

export function skyCircle(ra, dec, radius) {
  const d = dec * Math.PI / 180, rr = radius * Math.PI / 180, a = ra * Math.PI / 180
  return Array.from({ length: 65 }, (_, i) => {
    const th = i / 64 * Math.PI * 2
    const d2 = Math.asin(Math.sin(d) * Math.cos(rr) + Math.cos(d) * Math.sin(rr) * Math.cos(th))
    const a2 = a + Math.atan2(Math.sin(th) * Math.sin(rr) * Math.cos(d), Math.cos(rr) - Math.sin(d) * Math.sin(d2))
    return [a2 * 180 / Math.PI, d2 * 180 / Math.PI]
  })
}
