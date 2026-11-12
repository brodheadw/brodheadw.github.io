import * as THREE from 'three'

// A one-pixel ID render reads only the object under the pointer, including dense catalogs.
export function createPicker(renderer, scenes) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, type: THREE.UnsignedByteType })
  const pixel = new Uint8Array(4)
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
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear()
        for (const { scene, camera } of passes) {
          camera.setViewOffset(width, height, Math.floor(x), Math.floor(y), 1, 1)
          renderer.clearDepth(); renderer.render(scene, camera); camera.clearViewOffset()
        }
        renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel)
      } finally {
        for (const { camera } of passes) camera.clearViewOffset()
        for (const [object, key, value] of changed) object[key] = value
        renderer.setRenderTarget(prior); renderer.setClearColor(color, alpha)
        renderer.toneMapping = tone; renderer.outputColorSpace = colorSpace
      }
      return pixel[0] | pixel[1] << 8 | pixel[2] << 16
    },
    dispose() { target.dispose() },
  }
}
