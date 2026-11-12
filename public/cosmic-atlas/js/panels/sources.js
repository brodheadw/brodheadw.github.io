// Data provenance and caveats. Static.
const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`

export default {
  id: 'sources',
  title: 'Sources & caveats',
  open: false,
  mount(el) {
    el.innerHTML = `<div class="notice">
      ${link('https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/AJ/145/101', 'UNGC')} (nearby galaxies, measured distances) ·
      ${link('https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26', '2MRS')} (redshifts, cz &gt; 3000 km/s) ·
      ${link('https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/269/25', 'IceCat-1')} (IceCube track alerts) ·
      ${link('https://icecube.wisc.edu/data-releases/20210126_PS-IC40-IC86_VII.zip', 'IceCube 10-year tracks')} (target counts) ·
      ${link('https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=IX/72', '4FGL-DR4')} (Fermi-LAT sources) ·
      ${link('https://irsa.ipac.caltech.edu/data/Planck/release_2/all-sky-maps/', 'Planck 2015 lensing')} (dark-matter overlay).
      Sky overlays are HiPS surveys served by CDS, ESA ESASky, IRSA, JAXA DARTS, IRAP CADE, CASDA and CAMRAS.</div>
      <div class="notice">The curated galaxies use approximate literature values; the Sun is the origin, not the Galactic center.
      Boötes III is a disrupting stellar system / dwarf-galaxy candidate and its classification is debated.
      Neutrino and gamma-ray entries are directions, not distances, and an angular coincidence is not a detection.
      Redshift distances assume flat ΛCDM (H0 = 70 km/s/Mpc, Ωm = 0.3) and are not flow-corrected.
      Overlays are resampled to ~7′ and are for orientation, not photometry.</div>`
  },
}
