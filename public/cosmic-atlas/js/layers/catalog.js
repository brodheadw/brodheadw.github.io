import { loadTable } from '../data/loaders.js'
export default {
  kind: 'points3d', panels: ['filters', 'inspector'],
  load: (_, layer, options) => loadTable(layer, options),
  render: (ctx, table, layer) => ctx.renderer.addTable(layer, table),
  inspect: row => row,
  legend: layer => ({ shape: '●', label: layer.title, color: layer.style?.color }),
}
