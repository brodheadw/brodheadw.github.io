# Cosmic Atlas — exploratory association framework

This package extends the offline 3D sky viewer with a **reproducible statistical back end**. It does not contain real DESI, IceCube, or Fermi catalog data. No dark-matter or neutrino source detection is claimed.

## Files
- `cosmic_atlas_3d_v3.html`: interactive 3D atlas with catalog CSV imports and analysis-report import.
- `analyze.py`: a reproducible, RA-scrambled exploratory background study with per-event angular uncertainty and a scan-adjusted permutation probability over user-supplied targets.
- `sample_*.csv`: deliberately **synthetic example events** for testing, not observational data.
- `test_analyze.py`: basic statistical / coordinate tests.

## Run

```bash
python -m pip install numpy
python analyze.py --neutrinos sample_neutrinos_SYNTHETIC.csv --targets sample_targets.csv --fermi sample_fermi_SYNTHETIC.csv --scrambles 2000 --seed 2026 --out analysis_report.json
python -m unittest -v test_analyze.py
```

Open the HTML viewer. Import catalogs through its sidebar, then import `analysis_report.json` into the analysis panel. The JSON includes `schema: cosmic-atlas-analysis-v1`.

## Expected CSV fields
- Neutrinos: `ra_deg,dec_deg,angular_error_deg`, optional `name,energy_gev`.
- Targets: `name,ra_deg,dec_deg`.
- Fermi: `name,ra_deg,dec_deg`.
- Galaxy viewer: `name,ra_deg,dec_deg,distance_mpc` or `z`.

Convert public FITS files to CSV using astronomy libraries such as `astropy` before loading. The IceCube angular error proxy must be inspected for the specific release — do not blindly equate a field like `AngErr` with a calibrated 1-sigma Gaussian error. Real IceCube track event releases sometimes supply `log10(E/GeV)` rather than energy in GeV: map carefully and retain documentation.

## Methods and caveats

Each target score sums `exp(-0.5*(angular_separation/event_uncertainty)^2)` over events. This is **not** a calibrated astrophysical likelihood; it simply rewards events close to a target relative to reported uncertainty. Scrambles draw random right ascensions for events while preserving declination and uncertainty; this preserves an approximate declination-dependent event acceptance. The empirical local tail probability is `(1 + null_ge_observed)/(B+1)`; scan-adjusted probabilities compare standardized scores with the maximum across the *supplied* target list for each scramble. This corrects for the provided target scan, **not** unknown previous searches, a posteriori target choices, changes to event selection, time windows, or search radii. Sufficient scrambles and a scientifically appropriate detector exposure model are required for inferential use.

The CSV crossmatch and rendered layers are exploratory. **Sky proximity cannot establish a source distance, a physical association, or dark matter.** A publishable IceCube point-source study requires official instrument-response functions, season-level effective area and livetime, energy-dependent signal/background PDFs, time dependence where relevant, documented event selections, detector systematics, and calibrated trials factors.

Official sources: https://icecube.wisc.edu/science/data-releases/ ; https://data.desi.lbl.gov/public/dr1/ ; https://fermi.gsfc.nasa.gov/ssc/data/access/lat/14yr_catalog/