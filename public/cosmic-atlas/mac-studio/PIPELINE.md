# Pipeline inputs, products and limits

Run `mac-studio/run_all.sh` on the Mac Studio. It uses the scientific Python environment at
`~/cosmic-atlas-catalogs/.venv`, publishes cached normalized CSVs, builds target expectations,
columnar catalogs, numeric sky fields, effective-area tables and `data/layers.json`, then runs
the pipeline tests. It never commits or pushes. `PYTHON`, `ATLAS_SOURCE_DIR` and `ATLAS_REPO`
can override the existing machine paths.

Network refreshes are explicit:

- `--fetch-catalogs`: refresh UNGC/2MRS, IceCat-1 and 4FGL-DR4 from the existing VizieR TAP queries.
- `--overlays`: rebuild the complete sky set; `--overlays=cmb,cmb_act,wmap,egret,gaia_density,euv,co`
  retries only the seven CDS-only surveys. A failed survey keeps its previous JPEG and records
  the error in `data/overlays/overlay-status.json`. `ATLAS_HTTP_TIMEOUT` sets each request timeout.
- `--satellites`: request the separate policy-aware CelesTrak snapshot refresh. The default
  pipeline does not make public data-provider requests. See the satellite fetcher's policy notes.

`build_web_catalogs.py` uses only Python's standard library for catalogs/registry. `--fields`
also requires the already installed numpy and healpy. It rejects changed CSV column names or
order, empty files, invalid rows, non-finite/out-of-range coordinates, missing galaxy distances
and mismatched field counts. Every row is checked before any catalog binary is replaced.
Outputs are deterministic: SHA256 identifies exact bytes, source SHA256 identifies the data
version, source modification time supplies `updated_at`, and identical bytes do not rewrite a file.

The table format is `cosmic-atlas-columnar-v1`: a `.bin` containing contiguous little-endian
Float32 columns, plus `.header.json` with byte offsets, row counts, units, string columns,
source checksums, citation, license status and version. Optional numeric values use IEEE NaN;
direction-only layers have no distance. CSV and curated JSON remain the authoritative fallback.

`data/icecube-acceptance.json` exposes every released effective-area energy/declination bin for
IC40, IC59, IC79, IC86-I and IC86-II. The last applies to IC86-II through VII. These values use
**true neutrino energy**, not reconstructed muon energy, and source expectations require a flux
spectrum and livetime convolution. This is separate from the declination-band empirical
background in `build_targets.py`. The official [IceCube release](https://icecube.wisc.edu/data-releases/2021/01/all-sky-point-source-icecube-data-years-2008-2018/)
describes the IRFs and the point-source selection.

Numeric projected fields use `cosmic-atlas-scalar-grid-v1`. Each JSON header names a Float32
binary and a separate Uint8 validity mask. Grids are ICRS equirectangular 360×180 pixel centres:
RA = `360 - (x + 0.5) / width * 360`; Dec = `90 - (y + 0.5) / height * 180`.

- `fields/lensing`: the actual Planck R2 MV convergence alm, Wiener filtered with
  `C_L/(C_L+N_L)`, L<8 removed and 1.5° FWHM smoothed. Mask is the released Planck analysis
  mask resampled to nside=256 with threshold 0.5. Values are dimensionless κ.
- `fields/density`: unweighted UNGC+2MRS angular counts at HEALPix nside=128, 3° FWHM smoothed.
  Values are galaxies per original HEALPix pixel. No completeness or radial-selection correction
  is applied. The Galactic-plane gap is survey selection, not evidence for an empty universe.

Profiles and correlations must use these numeric values and masks, never JPEG colours.
The fields have different smoothing scales; an exploratory correlation is not a calibrated
cosmological inference. The JPEG maps are display resamplings, for orientation rather than photometry.

## Explicit unsupported volume source

TODO: verify a downloadable 3D reconstruction grid, its coordinate system, normalization,
selection function and redistribution terms (for example a released 2M++ or Cosmicflows grid).
No such input was verified for this update, so no 3D density texture or isosurface is published.
The projected Planck lensing map is never extruded or relabelled as a 3D dark-matter field.

Existing normalized catalogs do not include per-object distance methods or uncertainties.
The registry marks this omission instead of assigning guessed values. The existing survey
images and scientific catalogs also lack verified redistribution license records in the old
pipeline; the registry explicitly says TODO rather than claiming a license. Client libraries
have their own recorded licenses, separate from the data they display.

`data/pipeline-status.json` lists catalog checksums/row counts, available/missing overlays,
the last recorded overlay retry and unavailable optional volume input. CelesTrak status remains
separate so a blocked satellite refresh cannot remove valid cached astronomy data.
