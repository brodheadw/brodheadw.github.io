export default { kind: 'satellites', panels: ['satellite-data', 'satellites', 'passes', 'orbit-study', 'statistics'], load: app => app.loadSatellites(),
  render: () => ({ update() {}, dispose() {} }), legend: () => ({ shape: '◇', label: 'Public GP predictions · element age matters' }) }
