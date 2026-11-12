import * as THREE from 'three'

/** Visible photosphere illustration: white light and limb darkening, no dated sunspots. */
export function createSunMaterial() {
  return new THREE.ShaderMaterial({ transparent: true, uniforms: { opacity: { value: 1 } },
    vertexShader: 'varying vec3 normalView,viewDirection,surface;void main(){vec4 p=modelViewMatrix*vec4(position,1.);surface=position;normalView=normalize(normalMatrix*normal);viewDirection=-p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader: `uniform float opacity;varying vec3 normalView,viewDirection,surface;
    void main(){float mu=max(0.,dot(normalize(normalView),normalize(viewDirection)));float limb=.4+.6*mu;
    float grain=sin(surface.x*4300.+sin(surface.y*3500.))*sin(surface.z*3900.+surface.y*2800.);
    float footprint=max(max(fwidth(surface.x),fwidth(surface.y)),fwidth(surface.z));float resolved=1.-smoothstep(.0004,.002,footprint);
    gl_FragColor=vec4(vec3(1.,.965,.90)*limb*(.99+.01*grain*resolved),opacity);
    #include <colorspace_fragment>
    }` })
}
