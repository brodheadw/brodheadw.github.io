# Cosmic Atlas

Interactive 3D and all-sky viewer for nearby galaxies, IceCube neutrinos and Fermi gamma-ray sources, plus an independent re-run of the 2026 Boötes III dark-matter neutrino excess.

- `index.html` — page shell. The app is ES modules in `js/`: `core.js` (data, 3D view, sky map, ASCII mode), `main.js` (mounts the sidebar), and one file per sidebar panel in `js/panels/`. To add a panel, write `js/panels/<name>.js` exporting `{ id, title, mount(el, atlas) }` and list it in `main.js`.
- `bootes.html` — the Boötes III reproduction (TS map, mass scan, background trials, comparison with the paper).
- `data/` — everything the pages load, produced on the Mac Studio: catalogs, `curated.json` (named nearby galaxies), `targets.json` (neutrino counts per galaxy), `overlays/` (sky images + `overlays.json`).

## Mac Studio pipeline (`mac-studio/`)

| Script | Does |
|---|---|
| `fetch_catalogs.py` | Pulls UNGC + 2MRS galaxies, IceCat-1 alerts and Fermi 4FGL-DR4 from VizieR TAP into `~/cosmic-atlas-catalogs`. |
| `publish_catalogs.py` | Validates those CSVs, copies them to `data/` and writes `manifest.json` (`--push` commits and pushes). |
| `build_overlays.py` | Renders ~35 all-sky overlays into equirectangular JPEGs plus `overlays.json`: HiPS surveys (order-3 Allsky from whichever mirror answers), Planck 2015 CMB lensing (dark matter), 2MRS galaxy density and the IceCube excess. Add a sky by adding a `SURVEYS` row. Needs `healpy` and `matplotlib` (venv: `~/cosmic-atlas-catalogs/.venv`). |
| `build_targets.py` | Counts IceCube 10-year tracks around each nearby galaxy, with the chance expectation at its declination, into `targets.json`. |
| `bootes_repro.py` | Unbinned point-source likelihood on IceCube's 10-year public tracks (`icecube_10year_ps`), DM line spectrum mass scan, RA-scrambled trials. |
| `export_web.py` | Bundles fit, TS map, events and trials into `data/bootes_analysis.json`. |

The analysis scripts need `numpy`, `scipy` and `pillow`. The IceCube release is at <https://icecube.wisc.edu/data-releases/20210126_PS-IC40-IC86_VII.zip>.

## Caveats

Neutrino and gamma-ray positions are directions, not distances. The DM spectrum in `bootes_repro.py` is a pure νν̄ line; the paper (arXiv:2606.01853) adds the HDMSpectra electroweak continuum, so best-fit masses differ. A ~3σ excess is a hint, not a detection.
