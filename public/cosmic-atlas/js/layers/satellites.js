export default { kind: 'satellites', panels: ['satellites', 'passes', 'statistics'], load: app => app.loadSatellites(),
  render: () => ({ update() {}, dispose() {} }), legend: () => ({ shape: '◇', label: 'Public GP predictions · element age matters' }) }
