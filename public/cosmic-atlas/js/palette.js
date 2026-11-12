export const palette = Object.freeze({
  bg: '#060a11', panel: '#0b121b', edge: '#243040', ink: '#e8f1f6', muted: '#8497ab',
  accent: '#84d9e8', target: '#ffcb6c', major: '#65baff', catalog: '#65baff',
  dwarf: '#e9adff', neutrinos: '#6ef2bd', fermi: '#ff788d', sun: '#ffd88a',
  grid: '#294353', mask: '#282c34', earth: '#65baff', moon: '#bfc7cd',
  blazar: '#ff788d', pulsar: '#84d9e8', uncertain: '#e9adff', other: '#ffcb6c',
})

export function fermiColor(value) {
  const type = String(value || '').toLowerCase()
  return /psr|msp/.test(type) ? palette.pulsar : /bll|fsrq/.test(type) ? palette.blazar : type === 'bcu' ? palette.uncertain : type ? palette.other : palette.muted
}

export function installPalette() {
  for (const [key, color] of Object.entries(palette)) document.documentElement.style.setProperty(`--${key}`, color)
}
