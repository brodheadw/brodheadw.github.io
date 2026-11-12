import catalog from './catalog.js'
export default { ...catalog, kind: 'directions', panels: ['filters', 'inspector', 'experiment'],
  legend: layer => ({ shape: layer.id === 'fermi' ? '+' : '◇', label: `${layer.title} · direction only`, color: layer.style?.color }) }
