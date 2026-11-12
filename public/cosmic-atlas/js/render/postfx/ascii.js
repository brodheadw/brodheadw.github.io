import * as THREE from 'three'

export function createAsciiPass(renderer) {
  const atlas = document.createElement('canvas'); atlas.width = 16 * 16; atlas.height = 20
  const ctx = atlas.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, atlas.width, atlas.height)
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const chars = ' .,:;-=+*%#@'
  for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * 16 + 8, 10)
  const glyphs = new THREE.CanvasTexture(atlas); glyphs.magFilter = THREE.NearestFilter
  const target = new THREE.WebGLRenderTarget(1, 1)
  const uniforms = { frame: { value: target.texture }, glyphs: { value: glyphs }, resolution: { value: new THREE.Vector2(1, 1) } }
  const material = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D frame,glyphs;uniform vec2 resolution;varying vec2 uvv;
      void main(){vec2 cell=vec2(8.,13.);vec2 p=uvv*resolution;vec2 center=(floor(p/cell)+.5)*cell/resolution;
      vec3 c=texture2D(frame,center).rgb;float lum=dot(c,vec3(.299,.587,.114));float ix=floor(clamp(sqrt(lum)*1.4,0.,1.)*11.);
      vec2 g=vec2((ix+fract(p.x/cell.x))/16.,fract(p.y/cell.y));float mask=texture2D(glyphs,g).r;
      gl_FragColor=vec4(c*mask*1.8,1.);
      #include <colorspace_fragment>
      }` })
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  const camera = new THREE.Camera()
  return {
    target,
    resize(w, h) { target.setSize(w, h); uniforms.resolution.value.set(w, h) },
    render() { renderer.setRenderTarget(null); renderer.render(scene, camera) },
    dispose() { target.dispose(); glyphs.dispose(); material.dispose(); scene.children[0].geometry.dispose() },
  }
}
