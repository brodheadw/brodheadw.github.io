# Cosmic Atlas

Interactive 3D and all-sky viewer for nearby galaxies, IceCube neutrinos and Fermi gamma-ray sources, plus an independent re-run of the 2026 Boötes III dark-matter neutrino excess.

- `index.html` — the atlas: 3D view, all-sky map with overlays (Planck CMB, Fermi gamma rays, optical Milky Way, Planck dust, IceCube 10-year excess).
- `bootes.html` — the Boötes III reproduction (TS map, mass scan, background trials, comparison with the paper).
- `data/` — everything the pages load, produced on the Mac Studio.

## Mac Studio pipeline (`mac-studio/`)

| Script | Does |
|---|---|
| `fetch_catalogs.py` | Pulls UNGC + 2MRS galaxies, IceCat-1 alerts and Fermi 4FGL-DR4 from VizieR TAP into `~/cosmic-atlas-catalogs`. |
| `publish_catalogs.py` | Validates those CSVs, copies them to `data/` and writes `manifest.json` (`--push` commits and pushes). |
| `build_overlays.py` | Renders the all-sky overlay images (CDS hips2fits + an IceCube excess map) into equirectangular JPEGs. |
| `bootes_repro.py` | Unbinned point-source likelihood on IceCube's 10-year public tracks (`icecube_10year_ps`), DM line spectrum mass scan, RA-scrambled trials. |
| `export_web.py` | Bundles fit, TS map, events and trials into `data/bootes_analysis.json`. |

The analysis scripts need `numpy`, `scipy` and `pillow`. The IceCube release is at <https://icecube.wisc.edu/data-releases/20210126_PS-IC40-IC86_VII.zip>.

## Caveats

Neutrino and gamma-ray positions are directions, not distances. The DM spectrum in `bootes_repro.py` is a pure νν̄ line; the paper (arXiv:2606.01853) adds the HDMSpectra electroweak continuum, so best-fit masses differ. A ~3σ excess is a hint, not a detection.
