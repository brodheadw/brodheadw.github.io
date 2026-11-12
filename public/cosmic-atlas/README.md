# Cosmic Atlas v4

A static, framework-free atlas of nearby galaxies, neutrino directions, gamma-ray sources,
projected sky fields, Solar System bodies and public satellite predictions. The default setup
is the Boötes III study: Local Group galaxies, IceCat-1 alerts and the IceCube excess sky.

The page is served directly from `public/cosmic-atlas/` at
[brodheadw.github.io/cosmic-atlas](https://brodheadw.github.io/cosmic-atlas/).
There is no application server or bundler. The surrounding Next.js static export copies
`public/` unchanged. A push to `main` deploys the site, so run the checks below before pushing.
The independent likelihood reproduction remains at [bootes.html](bootes.html).

## Use and navigation

- Choose Explore, Neutrinos, Dark matter, Gamma rays, Boötes III study, Solar System,
  Earth & satellites, or Custom. Each workspace chooses layers, camera and sidebar panels.
- Drag to orbit, scroll to zoom and use scale anchors to travel between Earth orbit,
  the Solar System, the Milky Way, the Local Group and the cosmic web. Free look uses pointer
  lock and WASD movement. Touch orbit/pinch and keyboard search remain available.
- The 3D and Hammer-Aitoff sky views share layer visibility, opacity, filters and selection.
  Direction-only catalogs sit on a camera-centred celestial sphere. Events are not assigned
  invented distances or drawn as thousands of sightlines.
- Labels are real DOM text with priority and collision avoidance. ASCII is a render pass;
  labels and interface text remain readable. Reduced-motion preferences suppress tweens.
- Save named setups locally, export/import JSON or copy compressed URL state. Setups include
  filters, camera, clock, selection, panel preferences and saved experiments. Storage failure
  is handled so localStorage is not required for using the atlas.
- The shared UTC clock controls bodies, Earth rotation and available satellite predictions.
  Visible-scale body glyphs enlarge radii without changing positions or distances.
- Target ranking switches between published track counts, filtered IceCat-1 alerts and Fermi
  sources, over the published target list or visible catalog objects. Cone radius and optional
  distance/residual/coordinate columns are saved with the setup. Chance expectations always
  remain visible. Published tracks retain their fixed cone and do not invent missing counts.

## Architecture

| Area | Responsibility |
|---|---|
| `index.html`, `js/app.js` | Shell, boot, catalog loading, clock, selection and coordination. |
| `js/store.js` | Observable immutable state, validation/migration and undo/redo. |
| `js/presets.js`, `js/url-state.js`, `presets/` | Versioned setups, guarded localStorage, JSON import/export and compressed links. |
| `js/astro/` | Coordinates, Hammer projection, cosmology, units, time scales, ephemerides and orbital frames. |
| `js/data/` | Registry/table validation, binary/CSV/JSON readers, worker filters and satellite transport. |
| `js/render/` | Three.js camera-relative scene, GPU points/picking, celestial sphere, map, labels and ASCII. |
| `js/layers/` | Catalog, directions, sky-map, Solar System and satellite descriptors; explicit unsupported-volume stub. |
| `js/workspaces/` | Workspace layer/camera/panel choices. |
| `js/shell/`, `js/panels/` | Context-sensitive sidebar, command palette, controls and projected-field analysis. |
| `js/experiments/` | Worker cone/stacking tests, backgrounds/exports and numeric field sampling/statistics. |
| `js/palette.js` | Shared CSS/canvas/WebGL colours. |
| `mac-studio/`, `tests/` | Data publishing plus Python, Node and desktop/mobile browser checks. |

Three.js **0.181.1** is vendored and pinned by the import map. Astronomy Engine **2.1.19**
and satellite.js **7.1.0** are vendored too; their MIT license files are included in `js/vendor/`.
Runtime dependencies do not require a CDN request. Playwright is development-only.
The v4 entry point is `js/app.js`; the superseded canvas renderer and fixed panel stack were removed.

`data/layers.json` is the generated source of dataset titles, geometry, files, schemas,
citations, license status, timestamps, styles and filters. Catalog tables use
`{length, columns: {ra, dec, mpc, z, err, energy}, strings: {name, cls, assoc, ...}, meta}`.
Numeric columns are typed arrays; missing numbers are NaN. Large parsing, filtering,
scrambles and satellite propagation run in workers.

For another dataset of an existing geometry, add its validated pipeline input/configuration
and registry entry. A new geometry also needs a local descriptor in `js/layers/`; the registry's `module` names that file without an extension. Plugin names are restricted to local simple names. Workspaces are listed in `js/workspaces/index.js`; focused layers may
append their own panels. Panels export `{id, title, mount(el, app)}` and may return cleanup.

## Data and provenance

The shipped catalogs contain **41,199** UNGC+2MRS galaxies, **275** IceCat-1 alerts,
**7,195** 4FGL-DR4 sources and **29** curated rows including the observer. The 119-target table
uses **451,947** public IceCube tracks after the reconstructed-energy cut. The registry also
lists 26 available sky textures and computed Solar System/satellite descriptors.

| Data | Source and meaning |
|---|---|
| `galaxies.csv` | Karachentsev et al. (2013), [UNGC, J/AJ/145/101](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/AJ/145/101), and Huchra et al. (2012), [2MRS, J/ApJS/199/26](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJS/199/26). Measured UNGC distances and 2MRS redshift-derived comoving distances. |
| `neutrinos.csv` | Abbasi et al. (2023), [IceCat-1, J/ApJS/269/25](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJS/269/25). Directions, energy proxy and approximate error radius; no source distances. |
| `fermi.csv` | [Fermi-LAT 4FGL-DR4, IX/72](https://cdsarc.cds.unistra.fr/viz-bin/cat/IX/72). Direction, class and association; no assigned distances. |
| `curated.json` | Hand-maintained Local Group landmarks; approximate distances with missing-method/uncertainty caveats. |
| `targets.json` | Counts within 1.5°, declination-band chance expectations and count residuals. |
| `icecube-acceptance.json` | All 10,000 effective-area bins across five configurations in the [IceCube public release](https://icecube.wisc.edu/data-releases/2021/01/all-sky-point-source-icecube-data-years-2008-2018/). True neutrino energy, not weights for a reconstructed-energy count cut. |
| `fields/lensing.*` | Actual [Planck R2 MV convergence](https://pla.esac.esa.int/#cosmology), Wiener-filtered and 1.5° FWHM smoothed, with released mask. |
| `fields/density.*` | Unweighted angular UNGC+2MRS counts, 3° FWHM smoothed; no completeness/selection correction. |
| `overlays/` | ICRS equirectangular images, RA increasing left, centre RA 180°. Survey provenance is retained in the registry. |

Numeric fields are 360×180 Float32 grids plus Uint8 masks, separate from display JPEGs.
The Dark matter panel samples an east–west great-circle cut and computes a solid-angle-weighted
Pearson correlation over common pixels, applying the real mask by default. The checkbox affects
the profile/statistic, not the displayed JPEG. Curves have separate labelled vertical scales.
The differently smoothed, selection-affected projected fields support exploratory comparisons,
not a claimed cosmological significance.

Scientific data redistribution licenses were absent from the previous pipeline and could
not all be verified during this update. Affected entries explicitly say **TODO**; library MIT
licenses do not license datasets. Per-object distance methods and uncertainties absent from
the normalized inputs are not guessed.

## Mac Studio pipeline

```sh
cd ~/brodheadw.github.io/public/cosmic-atlas
mac-studio/run_all.sh
```

The entry point uses cached inputs and the scientific Python environment in
`~/cosmic-atlas-catalogs/`. It publishes validated CSVs, builds target expectations, binary
tables, numeric fields and IRF JSON, writes layer/status manifests and runs Python checks.
It never commits or pushes. Network refreshes are explicit:

```sh
mac-studio/run_all.sh --fetch-catalogs
mac-studio/run_all.sh --overlays=cmb,cmb_act,wmap,egret,gaia_density,euv,co
mac-studio/run_all.sh --satellites
```

| Script | Work |
|---|---|
| `fetch_catalogs.py` | Existing VizieR TAP queries to normalized CSVs. |
| `publish_catalogs.py` | Validates all source rows before replacement. Its historical `--push` remains explicit and is never used by the entry point. |
| `build_web_catalogs.py` | Strict schemas, little-endian tables, units/strings/provenance, SHA256, IRFs, numeric fields and registries. |
| `build_overlays.py` | HiPS Allsky reprojection plus lensing/density/IceCube excess; failures preserve cached images and record errors. |
| `build_targets.py` | Track cone counts with declination-band backgrounds. |
| `fetch_satellites.py` | Policy-aware GP/SATCAT snapshots, freshness/count checks, cooldown and previous-snapshot preservation. |
| `bootes_repro.py`, `export_web.py` | Likelihood, trials and reproduction-page bundle. |

The columnar builder checks every row, refuses schema drift and writes only changed bytes.
Headers include row count, units, source checksum, version, citation and license status.
The browser prefers validated binaries and falls back to CSV/JSON. See
[mac-studio/PIPELINE.md](mac-studio/PIPELINE.md) for formats, processing and path overrides.

The seven requested CDS retries were attempted on **2026-11-12**: primary mirrors returned
404 and alternates timed out for each. All 26 old JPEGs were verified unchanged by SHA256;
the cached CMB remains. ACT, WMAP, EGRET, Gaia density, ROSAT WFC and Dame CO are absent.
Exact errors are in `data/overlays/overlay-status.json`.

## Solar System and satellite limits

Astronomy Engine computes planets, the Moon and four Galilean moons at the shared clock.
Positions are geometric J2000 equatorial vectors with approximately one-arcminute model
accuracy; geometric RA/Dec excludes light time and aberration. UTC/TAI/TT helpers handle
leap-second boundaries explicitly. The leap table needs maintenance after new IERS announcements.

Satellite states use satellite.js SGP4/SDP4 in a worker. The model exposes TEME/approximate
GCRS vectors, Earth-fixed/geodetic position, velocity, elements, shadows, look angles,
trajectories, geometric passes, pair measurements and close-approach screening. Without EOP,
Earth orientation explicitly assumes UT1=UTC and zero polar motion. Passes use the geometric
horizon without refraction. Close approaches are screening estimates, not conjunction
assessments. Magnitudes are not fabricated.

**No current satellite snapshot is bundled.** CelesTrak's full public endpoint returned
HTTP 403 for an existing public-IP download block. The fetcher records the condition and
suspends requests instead of substituting verification objects. The Earth workspace reports
the missing snapshot. A current ISS check and full-catalog propagation performance cannot
be claimed until a valid snapshot is available.

The fetcher follows [CelesTrak's usage policy](https://celestrak.org/usage-policy.php), enforces
at least two hours between GP refreshes and daily SATCAT refreshes, and accepts offline
`--gp-file`/`--satcat-file` inputs. The repository workflow `.github/workflows/satellite-data.yml`
is configured for six-hour refreshes to a separate `satellite-data` branch, avoiding full
Next.js rebuilds for each update. The data branch has been published with the unavailable/
suspended status, and the browser checks it for future validated snapshots, with a bundled
snapshot fallback if the separate host is unreachable.
The workflow starts suspended from the recorded error; enabling it requires investigation
and an explicit resume after the cooldown. Visitors never fetch the catalog from CelesTrak.
Public catalogs omit restricted/untracked objects; predictions degrade with age and manoeuvres.

The Earth globe uses NASA Earth Observatory Blue Marble (August 2004) and Black Marble (2016)
maps, resized to 2048×1024. Exact originals, processing, SHA256, credits and NASA's reuse policy
are in `data/textures/sources.json`. These are historical display composites, not live weather.
Nearby stars, asteroid/comet/spacecraft vectors, group boundaries and a 3D density volume
remain TODO until sources, frames and redistribution terms are verified. The volume stub
fails clearly; projected sky fields are never extruded into a fabricated volume.

## Science conventions

- Neutrino/gamma-ray positions are directions only. IceCat-1's displayed radius averages
  asymmetric 90% coordinate bounds; it is not a calibrated circular likelihood.
- IceCube acceptance depends on declination. This track-energy cut collects many more
  southern tracks, so counts must be accompanied by chance expectations.
- Experiments report angular coincidence, not detection. Results record radius/error rule,
  fixed-declination RA background, scrambles, trials and versions. Overlapping target/event
  pairs are counted consistently in data and scrambles, without assuming independent targets.
  Finite-scramble p-values use the plus-one correction.
- Boötes III is a disrupting system/dwarf-galaxy candidate with debated classification.
  The reproduction uses a pure νν̄ line; the paper includes an electroweak continuum, so fitted
  masses differ. Exploratory counts are not the reproduction's likelihood significance.
- Cosmology is flat ΛCDM, H0=70 km/s/Mpc, Ωm=0.3. Lookback time is used for z>0.003.
  Resampled sky images are for orientation, not photometry.

## Run and verify

```sh
npm ci
npm test
~/cosmic-atlas-catalogs/.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
~/cosmic-atlas-catalogs/.venv/bin/python -m unittest discover -s tests/pipeline -p 'test_*.py' -v
npm run test:e2e
```

For manual browsing, `npm run serve` starts `http://127.0.0.1:8765/`. Playwright starts the
same server, with desktop and 390×844 mobile projects. Local screenshots/traces/performance
attachments go to `test-results/`, the HTML report to `playwright-report/`.

Unit checks cover astronomy, state/URL round trips, table schemas/layouts, filters, backgrounds,
labels and numeric fields/checksums/solid-angle weights. Python covers HiPS orientation,
equirectangular grids, isotropic expectations and catalog boundaries. Reference ephemeris/
satellite checks keep their fixtures and numerical error reports. Browser checks cover
workspaces, overlays, selection, presets, ASCII/labels, scale anchors, mobile layout,
astronomical frame rates and honest satellite availability.

Cached `run_all.sh` completed. Seventeen generated files retained identical bytes/mtimes on a
repeat build with unchanged inputs. See [VERIFICATION.md](VERIFICATION.md) for the integrated
test output, reference errors, visual checks, measured FPS, and remaining TODOs. No M1 or
full-satellite throughput claim is made without measurement.
