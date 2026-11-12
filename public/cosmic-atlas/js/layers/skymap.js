export default { kind: 'skymap', panels: [], load: async (_, layer) => layer,
  render: async (ctx, _, layer) => { await ctx.renderer.setTexture(layer); return { update() {}, dispose() {} } },
  legend: layer => ({ shape: '▨', label: layer.title, color: layer.style?.color }) }
