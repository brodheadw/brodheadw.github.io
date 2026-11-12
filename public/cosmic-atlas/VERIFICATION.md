# Cosmic Atlas v4 — verification and delivery

Verified on 12 November 2026 on `Williams-Mac-Studio.local` (Apple M3 Ultra). The static app
is served at [Cosmic Atlas](https://brodheadw.github.io/cosmic-atlas/). This report distinguishes
implemented tools, measured results, and data that could not be obtained.

## Built

- Framework-free ES modules with vendored, pinned Three.js 0.181.1, Astronomy Engine 2.1.19
  and satellite.js 7.1.0. No runtime bundler or application server.
- Camera-relative WebGL rendering across galaxy, Solar System and Earth scales; orbit,
  free flight, cursor zoom, touch gestures, scale anchors and a physical perspective ruler.
  Linear and log-radial views; GPU picking; collision-managed DOM labels with leader lines.
- Direction catalogs on a celestial sphere, error rings, 26 textured surveys, two-texture
  blending, shared Hammer sky view, and an ASCII pass that leaves labels and controls crisp.
- Eight context-sensitive workspaces; reusable panels with saved order/open state; searchable
  layers, citation/license details, opacity/solo, command palette and mobile bottom sheet.
- Versioned validated state, migration, undo/redo, named setups, JSON import/export and
  compressed share URLs. Worker filters, histograms and configurable target ranking.
- Worker cone and stacked angular-coincidence experiments with analytic expectations,
  seeded RA scrambles, finite-scramble p-values, trials, separation plots and saved/exported
  inputs/results/versions. Published Boötes track expectations and the independent
  [likelihood reproduction](bootes.html) remain available.
- Numeric Planck lensing and galaxy-density profiles, actual masks and solid-angle-weighted
  correlation; separate labelled units and explicit exploratory limits.
- A shared UTC clock, planetary ephemerides, the Moon and four Galilean moons, body/orbit
  rendering, true/visible radius modes, orbital elements, distances, velocities and rise/set.
  Earth has georeferenced day/night composites, rotation, sunlight and night lights.
- Satellite snapshot publisher, six-hour separate-data-branch workflow, SGP4 worker and
  typed-array rendering. Inspector, trajectories, sun/shadow ground tracks, follow, element
  ages, metadata, observer look angles/Doppler, pass predictions, filters/statistics, pair
  measurements, coarse-to-fine close-approach screening and JSON/CSV exports are implemented.
  These tools were verified with historical reference inputs; a current catalog is unavailable.
- Strict, idempotent binary/registry/field/IRF publishing and a single cached pipeline entry
  point. Existing CSV rows and cached sky JPEGs were retained.

## Integrated checks

Commands run from `public/cosmic-atlas/` unless stated otherwise:

```text
npm test
50 tests passed, 0 failed

npm run test:e2e
34 passed (desktop 1440×1000 and mobile 390×844; 2.1 minutes)

~/cosmic-atlas-catalogs/.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
Ran 6 tests — OK

~/cosmic-atlas-catalogs/.venv/bin/python -m unittest discover -s tests/pipeline -p 'test_*.py' -v
Ran 4 tests — OK

mac-studio/run_all.sh
Cached publication, binary/field generation and pipeline checks completed.

npm run build   [repository root]
Compiled successfully; lint/type checks passed; static pages generated/exported.
```

Publisher tests intentionally simulate HTTP 403 and invalid tables; their rejection messages
are expected passing checks. No provider requests are made by those tests.

Browser checks cover zero page/console/shader errors, all workspace panels, all 26 image
decodes, actual GPU selection in both views, Boötes inspection, DOM-label/HUD collisions,
ASCII, live filters, saved-setup file import/export, worker experiments and result exports,
camera scale transitions, and no mobile horizontal overflow. Catalog refresh replaces the
four loaded tables, retains exact masks/filters, and preserves functional GPU picking.
Screenshots of every workspace and each scale were reviewed at both viewport sizes.
The Solar opacity regression checks partial transparency, hiding and restoration of bodies,
Earth's shader, orbit paths and labels. Satellite refresh keeps NORAD identity through row
reordering, saved-state restoration and removal; hidden satellite layers do not download GP
snapshots during startup. The separate data workflow passes YAML/Bash syntax checks.

The satellite test intercepts the snapshot with an explicitly historical ISS input at
2019-12-09, uses the real propagation worker, finds ISS through search, checks changing
altitude/speed, orbit/ground-track geometry, Doppler, passes and exports. A sampled state was
421.732 km altitude and 7.66462 km/s. This is a software verification fixture, not a current
ISS observation or a published live snapshot.

## Reference accuracy

| Check | Measured result |
|---|---|
| Vallado SGP4/SDP4 verification | 666 valid vectors; max position error 1.170808×10⁻⁷ km (0.117 mm), max velocity error 8.528686×10⁻¹⁰ km/s; one expected invalid case |
| Reduced TEME→GCRS against Astropy | Max 1.920 m at approximately 7,348 km geocentric radius |
| ITRS against Astropy with Earth-orientation assumptions aligned | Max 0.013 m |
| Geometric passes against Skyfield | 21 passes at three sites; max rise/culmination/set discrepancy 0.192 s |
| Geometric vectors against JPL Horizons | Heliocentric planets and geocentric Moon; 30 states, ten bodies, dates in 2000/2026/2050; max angular error 0.272233 arcmin, below the library's approximately 1 arcmin target |
| Time and coordinates | Leap boundary UTC/TAI/TT, Galactic centre and frame round trips, Hammer round trips, units and flat-ΛCDM checks pass |

Reference fixtures, generation notes and tolerances are in
[`tests/unit/fixtures/README.md`](tests/unit/fixtures/README.md). SGP4 numerical agreement
does not quantify real-world orbital prediction accuracy. Without EOP, production orientation
assumes UT1=UTC and zero polar motion; passes exclude atmospheric refraction.

## Performance

Chromium via ANGLE Metal, actual renderer **Apple M3 Ultra**, with all **48,698 astronomical
rows** loaded and enabled (41,199 galaxies, 7,195 Fermi sources, 275 alerts, 29 curated rows).
The camera is settled at 80 Mpc; a two-second warmup precedes eight independent one-second
telemetry samples per viewport. Other agent-owned WebGL previews were closed.

| Viewport | Mean frame rate | Sample range | Mean rendering work per frame |
|---|---:|---:|---:|
| Desktop 1440×1000 | 76.96 fps | 71.90–81.56 fps | 0.66 ms |
| Mobile emulation 390×844 | 77.93 fps | 74.66–80.73 fps | 0.63 ms |

Rendering work is the application's JavaScript render-loop timer, not a GPU timer query.
Earlier single-window smoke readings during startup/transitions were 56.76 fps desktop
and 79.15 fps mobile; the table gives the sustained, settled measurement. These are local
browser samples, not a device guarantee. Mobile emulation runs on the
same Mac, not a phone. An M1 was unavailable. Full current-satellite-catalog propagation FPS
was not measured because no valid full snapshot could be fetched. It is not included in
the astronomical-row result.

## Data added or exposed

| Asset | Source and processing |
|---|---|
| Four binary catalogs and layer registry | Existing curated, UNGC+2MRS, IceCat-1 and 4FGL-DR4 inputs, validated in full; little-endian numeric columns with unit/schema/source/hash headers. Original catalog citations are in the generated registry and README. |
| Numeric lensing field + mask | [Planck Legacy Archive](https://pla.esac.esa.int/#cosmology), R2 MV convergence; Wiener filtered, 1.5° FWHM smoothed, sampled on a 360×180 grid with the released mask. |
| Numeric galaxy-density field | Existing UNGC+2MRS angular counts, unweighted and 3° FWHM smoothed, on the same grid. No completeness correction is claimed. |
| IceCube acceptance | All 10,000 effective-area bins from five detector configurations in the [2008–2018 public release](https://icecube.wisc.edu/data-releases/2021/01/all-sky-point-source-icecube-data-years-2008-2018/). True-energy response is not substituted for the reconstructed-energy track cut. |
| Earth day map | [NASA Blue Marble: Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/), August 2004 topography/bathymetry composite. |
| Earth night map | [NASA Black Marble](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/), 2016 composite. |
| Computed Solar System | [Astronomy Engine 2.1.19](https://github.com/cosinekitty/astronomy/tree/v2.1.19), MIT; physical parameters are cited in the module. |
| Satellite data transport and status | [CelesTrak](https://celestrak.org/); current data unavailable. Official constellation groups are supported, with membership provenance when fetched; name heuristics are explicitly labelled when group data is absent. |

Earth images are 2048×1024 and total 470,134 bytes. Original URLs, credits, processing and
both original/output SHA256 values are in `data/textures/sources.json`, including the NASA
reuse-policy link. They are historical display composites. Library licenses are included;
they do not confer dataset redistribution rights.

## Unavailable data and remaining TODOs

- **Current satellites:** the full endpoint returned HTTP 403 at 17:28:27 UTC on 2026-11-12,
  reporting an existing public-IP excessive-download block. Further GP requests stopped.
  The fetcher and workflow remain suspended until the provider response is investigated and
  explicitly resumed after the minimum cooldown. No test fixture is presented as current.
  Visitors check the published `satellite-data` branch, rather than downloading from CelesTrak.
  A resumed job must pass schema/count/freshness checks before publishing a real snapshot.
  See [CelesTrak's policy](https://celestrak.org/usage-policy.php).
- **CDS survey retries:** all seven requested reruns were attempted; primary endpoints
  returned 404 and alternate mirrors timed out. All 26 cached JPEG checksums were retained.
  Cached Planck CMB remains; ACT, WMAP, EGRET, Gaia density, ROSAT WFC and Dame CO are still
  absent. Exact failures are in `data/overlays/overlay-status.json`.
- **3D density volume:** no verified redistributable reconstruction grid was added. The
  explicit unsupported-volume descriptor is retained; projected lensing is not fabricated
  into 3D density.
- **Optional datasets:** nearby stars, minor bodies, spacecraft and named group/cluster
  boundaries await verified sources, frames and redistribution terms. Solar ephemerides
  currently include Earth's Moon and the four Galilean moons; other major moons remain TODO.
  A physically sourced Local Group mass barycentre is also TODO.
- **Licenses and distances:** some pre-existing survey/catalog redistribution licenses could
  not be verified. Registry entries carry explicit TODOs. Missing per-object distance methods
  and uncertainties are displayed as unavailable, not guessed.
- **Scientific limits:** angular coincidences are not detections; count residuals are not
  likelihood significance. Lensing/density correlation uses projected, differently smoothed,
  selection-affected fields. The mask control applies to numeric analysis, not reconstruction
  of missing JPEG pixels. Sky textures are for orientation, not photometry. Solar RA/Dec are
  geometric; satellite close approaches are screening estimates, not conjunction assessments.
  Optical magnitude is unavailable from GP elements alone. Restricted/untracked objects are
  absent from public catalogs. The leap table needs maintenance after future IERS changes;
  the browser date picker cannot represent a literal UTC `:60` leap-second instant.

## Deployment

The independent `satellite-data` branch was published with the recorded unavailable status.
The six-hour updater changes that branch without a Next.js deployment. It starts suspended;
no refresh was forced past the provider block.

The main-site deployment is checked after the final tested commits are pushed. See the
delivery message for the deployed commit and GitHub Actions result.
