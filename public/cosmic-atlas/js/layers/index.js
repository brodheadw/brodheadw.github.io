const modules = { catalog: './catalog.js', points3d: './catalog.js', directions: './directions.js', skymap: './skymap.js', solar: './solar.js', satellites: './satellites.js', volume: './volume.js' }
export async function loadLayerPlugin(layer) {
  if (layer.module && !/^[a-z][a-z0-9-]*$/.test(layer.module)) throw Error('Layer module must be a local plugin name')
  const path = layer.module ? modules[layer.module] || `./${layer.module}.js` : modules[layer.kind]
  if (!path) throw Error(`Unsupported layer kind: ${layer.kind}`)
  const plugin = (await import(path)).default
  return { ...plugin, ...layer, load: plugin.load, render: plugin.render, panels: [...new Set([...(plugin.panels || []), ...(layer.panels || [])])] }
}
