import * as THREE from 'three'

// Scissor the full projection so a point sprite remains pickable away from its centre.
export function createPicker(renderer, scenes) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, type: THREE.UnsignedByteType })
  const pixel = new Uint8Array(4), size = new THREE.Vector2()
  return {
    pick(x, y, width, height, passes) {
      const changed = []
      for (const scene of scenes) scene.traverse(object => {
        if (object.userData.pickMaterial) { changed.push([object, 'material', object.material]); object.material = object.userData.pickMaterial }
        else if (object.isRenderableObject || object.isMesh || object.isLine || object.isPoints || object.isSprite) {
          changed.push([object, 'visible', object.visible]); object.visible = false
        }
      })
      const prior = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), color = renderer.getClearColor(new THREE.Color())
      const tone = renderer.toneMapping, colorSpace = renderer.outputColorSpace
      renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace
      try {
        renderer.getDrawingBufferSize(size)
        if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y)
        const px = Math.max(0, Math.min(size.x - 1, Math.floor(x / width * size.x)))
        const py = Math.max(0, Math.min(size.y - 1, size.y - 1 - Math.floor(y / height * size.y)))
        target.scissor.set(px, py, 1, 1); target.scissorTest = true
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear()
        for (const { scene, camera } of passes) {
          renderer.clearDepth(); renderer.render(scene, camera)
        }
        renderer.readRenderTargetPixels(target, px, py, 1, 1, pixel)
      } finally {
        for (const [object, key, value] of changed) object[key] = value
        renderer.setRenderTarget(prior); renderer.setClearColor(color, alpha)
        renderer.toneMapping = tone; renderer.outputColorSpace = colorSpace
      }
      return pixel[0] | pixel[1] << 8 | pixel[2] << 16
    },
    dispose() { target.dispose() },
  }
}
