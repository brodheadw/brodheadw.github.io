#!/usr/bin/env python3
"""Validate every catalog row, write columnar binaries, and generate the layer registry.

python3 mac-studio/build_web_catalogs.py [atlas_dir] [--source-dir ~/cosmic-atlas-catalogs] [--fields]
Default operation needs only Python's standard library. --fields needs numpy and healpy.
No fetch, commit or push occurs here. Identical inputs leave identical output bytes and mtimes.
"""
import argparse
import ast
import csv
import datetime as dt
import hashlib
import json
import math
import pathlib
import struct

SCHEMA = 1
UNVERIFIED = 'TODO: redistribution license not verified; consult the original data provider.'
ICECUBE_URL = 'https://icecube.wisc.edu/data-releases/2021/01/all-sky-point-source-icecube-data-years-2008-2018/'
COLUMNS = {'ra': 'deg ICRS', 'dec': 'deg ICRS', 'mpc': 'Mpc', 'z': 'dimensionless', 'err': 'deg', 'energy': 'GeV'}
CATALOGS = [
    dict(id='galaxies', title='UNGC + 2MRS galaxies', kind='points3d', color='#65baff', size=2,
         fields=['name', 'ra_deg', 'dec_deg', 'distance_mpc', 'z'],
         citation=dict(title='Karachentsev et al. (2013), UNGC; Huchra et al. (2012), 2MRS; VizieR J/AJ/145/101 and J/ApJS/199/26', url='https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJS/199/26'),
         note='UNGC measured distances and 2MRS redshift-derived comoving distances. Flat ΛCDM H0=70 km/s/Mpc, Ωm=0.3. Per-object uncertainties/methods were not included in the normalized upstream CSV; TODO: enrich from the source catalog without inventing values.',
         filters=[dict(field='mpc', type='range', unit='Mpc'), dict(field='name', type='text')]),
    dict(id='neutrinos', title='IceCube alerts (IceCat-1)', kind='directions', color='#6ef2bd', size=4,
         fields=['name', 'ra_deg', 'dec_deg', 'angular_error_deg', 'energy_gev'],
         citation=dict(title='Abbasi et al. (2023), IceCat-1; VizieR J/ApJS/269/25', url='https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJS/269/25'),
         note='Directions only: no source distance. The displayed error radius is the mean of available asymmetric 90% coordinate bounds, not a calibrated circular containment region. Energy is a reconstructed proxy.',
         filters=[dict(field='energy', type='range', unit='GeV'), dict(field='err', type='range', unit='deg'), dict(field='name', type='text')]),
    dict(id='fermi', title='Fermi-LAT 4FGL-DR4 sources', kind='directions', color='#ff788d', size=2,
         fields=['name', 'ra_deg', 'dec_deg', 'class', 'association'],
         citation=dict(title='Fermi-LAT Fourth Source Catalog, Data Release 4; VizieR IX/72', url='https://cdsarc.cds.unistra.fr/viz-bin/cat/IX/72'),
         note='Directions only: catalog positions do not imply a measured distance. Source class and counterpart association are catalog classifications.',
         filters=[dict(field='cls', type='category'), dict(field='name', type='text')]),
]


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def updated(path):
    return dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat()


def encode_json(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def write(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == raw:
        return
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_bytes(raw)
    tmp.replace(path)


def number(value, name, row, lo, hi, optional=False):
    if optional and (value is None or value == ''):
        return math.nan
    try:
        n = float(value)
    except (ValueError, TypeError) as e:
        raise ValueError(f'row {row}: {name} is not numeric: {value!r}') from e
    if not math.isfinite(n) or n < lo or n > hi:
        raise ValueError(f'row {row}: {name} outside [{lo}, {hi}]: {value!r}')
    return n


def parse_catalog(path, config):
    """Strict normalized schemas are deliberate: upstream schema changes need human review."""
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != config['fields']:
            raise ValueError(f'{path.name}: schema drift: {reader.fieldnames!r}; expected {config["fields"]!r}')
        rows = list(reader)
    if not rows:
        raise ValueError(f'{path.name}: empty catalog')
    columns = {k: [] for k in COLUMNS}
    strings = {k: [] for k in ('name', 'cls', 'assoc')}
    for i, r in enumerate(rows, 2):
        if None in r or any(v is None for v in r.values()):
            raise ValueError(f'{path.name} row {i}: column count mismatch')
        if not r['name'].strip():
            raise ValueError(f'{path.name} row {i}: empty name')
        columns['ra'].append(number(r['ra_deg'], 'RA', i, 0, 360) % 360)
        columns['dec'].append(number(r['dec_deg'], 'Dec', i, -90, 90))
        columns['mpc'].append(number(r.get('distance_mpc'), 'distance', i, 0, 1e7, optional=True))
        columns['z'].append(number(r.get('z'), 'redshift', i, 0, 100, optional=True))
        columns['err'].append(number(r.get('angular_error_deg'), 'angular error', i, 0, 180, optional=True))
        columns['energy'].append(number(r.get('energy_gev'), 'energy', i, 0, 1e15, optional=True))
        if config['kind'] == 'points3d' and not math.isfinite(columns['mpc'][-1]):
            raise ValueError(f'{path.name} row {i}: missing distance')
        for k, source in [('name', 'name'), ('cls', 'class'), ('assoc', 'association')]:
            strings[k].append(r.get(source, ''))
    return columns, strings


def parse_curated(path):
    rows = json.loads(path.read_text())
    if not isinstance(rows, list) or not rows:
        raise ValueError('curated.json must be a nonempty list')
    columns = {k: [] for k in COLUMNS}
    strings = {k: [] for k in ('name', 'cls', 'assoc', 'type')}
    for i, r in enumerate(rows, 1):
        if set(r) != {'name', 'ra', 'dec', 'kpc', 'type'} or not isinstance(r['name'], str) or not r['name'].strip():
            raise ValueError(f'curated.json row {i}: schema drift or missing name')
        if r['type'] not in {'observer', 'target', 'major', 'dwarf'}:
            raise ValueError(f'curated.json row {i}: unknown type')
        columns['ra'].append(number(r['ra'], 'RA', i, 0, 360) % 360)
        columns['dec'].append(number(r['dec'], 'Dec', i, -90, 90))
        columns['mpc'].append(number(r['kpc'], 'distance', i, 0, 1e9) / 1000)
        for k in ('z', 'err', 'energy'):
            columns[k].append(math.nan)
        strings['name'].append(r['name'])
        strings['cls'].append(r['type'])
        strings['type'].append(r['type'])
        strings['assoc'].append('')
    return columns, strings


def pack_table(columns, strings, path, citation):
    length = len(columns['ra'])
    raw, header_columns = bytearray(), []
    for name, values in columns.items():
        if len(values) != length:
            raise ValueError(f'{name}: column length mismatch')
        header_columns.append(dict(name=name, dtype='float32', offset=len(raw), length=length, units=COLUMNS[name]))
        raw.extend(struct.pack(f'<{length}f', *values))
    source_hash = sha256(path.read_bytes())
    header = dict(schema=SCHEMA, format='cosmic-atlas-columnar-v1', length=length, row_count=length,
                  byteOrder='little', columns=header_columns, strings={k: v for k, v in strings.items() if k == 'name' or any(v)}, missing_numeric='IEEE-754 NaN',
                  sha256=sha256(raw), version=source_hash[:16], updated_at=updated(path),
                  source=dict(file=path.name, sha256=source_hash, citation=citation),
                  license=UNVERIFIED, provenance='Normalized by mac-studio/build_web_catalogs.py; source CSV or curated JSON is authoritative.')
    return bytes(raw), header


def acceptance(source_dir, data):
    """Expose the actual energy/declination-dependent IRFs, without assuming a source spectrum."""
    folder = source_dir / 'icecube-10yr/icecube_10year_ps/irfs'
    files = sorted(folder.glob('*_effectiveArea.csv'))
    if not files:
        return None
    seasons = []
    for file in files:
        lines = file.read_text().splitlines()
        expected = '#  log10(E_nu/GeV)_min  log10(E_nu/GeV)_max  Dec_nu_min[deg]  Dec_nu_max[deg]   A_Eff[cm^2]'
        if lines[0].strip() != expected.strip():
            raise ValueError(f'{file}: IRF schema drift')
        rows = []
        for i, line in enumerate(lines[1:], 2):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) != 5:
                raise ValueError(f'{file}:{i}: expected five IRF fields')
            values = [number(v, 'IRF', i, -90 if n in (2, 3) else 0, 90 if n in (2, 3) else 1e15) for n, v in enumerate(parts)]
            if values[0] >= values[1] or values[2] >= values[3]:
                raise ValueError(f'{file}:{i}: non-increasing bin boundaries')
            rows.append(values)
        if not rows:
            raise ValueError(f'{file}: empty IRF')
        seasons.append(dict(id=file.name.removesuffix('_effectiveArea.csv'), source_sha256=sha256(file.read_bytes()), rows=rows))
    result = dict(schema=1, updated_at=max(updated(p) for p in files), source=dict(title='IceCube 10-year public point-source release, effective-area tables', url=ICECUBE_URL),
                  license=UNVERIFIED, columns=['log10_true_energy_gev_min', 'log10_true_energy_gev_max', 'declination_deg_min', 'declination_deg_max', 'effective_area_cm2'],
                  seasons=seasons, note='Effective area is for true neutrino energy, not the reconstructed muon-energy cut. IC86_II applies to seasons IC86-II through VII. Expected source counts require a flux spectrum and livetime convolution; these are not raw track-density weights.')
    write(data / 'icecube-acceptance.json', (json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode())
    print('IceCube effective area:', len(seasons), 'configurations;', sum(len(s['rows']) for s in seasons), 'bins')
    return 'data/icecube-acceptance.json'


def build_fields(source_dir, data):
    """Real projected fields only. No 3D density is inferred from a 2D sky image."""
    import numpy as np
    import healpy as hp
    import build_overlays as overlay
    lensing = source_dir / 'lensing/data'
    width, height = 360, 180
    folder = data / 'fields'

    def output(key, values, mask, units, sources, processing, citation):
        binary = np.asarray(values, dtype='<f4').tobytes()
        mask_binary = np.asarray(mask, dtype=np.uint8).tobytes()
        if len(binary) != width * height * 4 or len(mask_binary) != width * height or not np.isfinite(values).all():
            raise ValueError(f'{key}: invalid numeric grid')
        version = sha256(''.join(sha256(p.read_bytes()) for p in sources).encode())
        header = dict(schema=1, format='cosmic-atlas-scalar-grid-v1', width=width, height=height,
                      file=f'data/fields/{key}.bin', maskFile=f'data/fields/{key}.mask.bin', dtype='float32', byteOrder='little', units=units,
                      sha256=sha256(binary), maskSha256=sha256(mask_binary), version=version[:16], updated_at=max(updated(p) for p in sources),
                      frame='ICRS', grid=dict(ra='360 - (x + 0.5) / width * 360', dec='90 - (y + 0.5) / height * 180'),
                      processing=processing, source=dict(citation=citation, files=[dict(file=p.name, sha256=sha256(p.read_bytes())) for p in sources]), license=UNVERIFIED)
        write(folder / f'{key}.bin', binary)
        write(folder / f'{key}.mask.bin', mask_binary)
        write(folder / f'{key}.json', encode_json(header))

    source_files = [lensing / n for n in ('dat_klm.fits', 'nlkk.dat', 'mask.fits.gz')]
    if all(p.exists() for p in source_files):
        alm = hp.read_alm(str(source_files[0]))
        ell, noise, total = np.loadtxt(source_files[1], unpack=True)
        lmax = hp.Alm.getlmax(len(alm))
        wiener = np.zeros(lmax + 1)
        good = ell <= lmax
        wiener[ell[good].astype(int)] = np.clip((total[good] - noise[good]) / total[good], 0, 1)
        wiener[:8] = 0
        kappa = hp.alm2map(hp.almxfl(alm, wiener * hp.gauss_beam(np.radians(1.5), lmax)), 256, lmax=lmax)
        values = overlay.healpix_to_grid(kappa, w=width, h=height)
        mask = overlay.healpix_to_grid(hp.ud_grade(hp.read_map(str(source_files[2])), 256), w=width, h=height) > .5
        output('lensing', values, mask, 'dimensionless convergence', source_files,
               'Planck 2015 R2 MV lensing κ alm, C_L/(C_L+N_L) Wiener filter, L<8 removed, Gaussian FWHM 1.5 deg; nside=256 then sampled at 1 deg pixel centres. Mask threshold >0.5. Projected convergence, not a 3D dark-matter reconstruction.',
               dict(title='Planck 2015 lensing release, MV convergence reconstruction', url='https://pla.esac.esa.int/#cosmology'))
    else:
        print('SKIP lensing numeric field: raw Planck files unavailable; previous output preserved')
    galaxy_source = source_dir / 'galaxies.csv'
    if galaxy_source.exists():
        columns, _ = parse_catalog(galaxy_source, CATALOGS[0])
        counts = np.bincount(hp.ang2pix(128, np.radians(90 - np.asarray(columns['dec'])), np.radians(columns['ra'])), minlength=hp.nside2npix(128)).astype(float)
        smoothed = hp.smoothing(counts, fwhm=np.radians(3))
        density = np.maximum(overlay.healpix_to_grid(smoothed, coord_in='C', w=width, h=height), 0)
        output('density', density, np.ones((height, width), dtype=np.uint8), 'galaxies per HEALPix nside=128 pixel', [galaxy_source],
               'Unweighted angular counts of normalized UNGC+2MRS galaxies, nside=128 RING, Gaussian FWHM 3 deg, sampled at 1 deg pixel centres; tiny negative harmonic ringing clipped to zero. Not corrected for distance selection or Galactic-plane incompleteness. All pixels retained; use Planck mask for joint statistics.', CATALOGS[0]['citation'])


def registry(atlas, catalogs, acceptance_path):
    data = atlas / 'data'
    layers = []
    for config, header in catalogs:
        key = config['id']
        files = dict(binary=f'data/{key}.bin', header=f'data/{key}.header.json')
        files['json' if key == 'curated' else 'csv'] = f'data/{key}.json' if key == 'curated' else f'data/{key}.csv'
        if key == 'neutrinos' and acceptance_path:
            files['acceptance'] = acceptance_path
        if key == 'neutrinos':
            files.update(targets='data/targets.json', reproduction='data/bootes_analysis.json')
        layers.append(dict(id=key, title=config['title'], kind=config['kind'], category='Catalogs', module='catalog' if config['kind'] == 'points3d' else 'directions',
                           files=files, schema=header['format'], citation=config['citation'], license=header['license'], updated_at=header['updated_at'], version=header['version'],
                           style=dict(color=config['color'], size=config['size']), filters=config['filters'], note=config['note'], rows=header['length']))
    overlays = json.loads((data / 'overlays/overlays.json').read_text())
    for row in overlays:
        if not {'key', 'file', 'label', 'group', 'note', 'source'} <= set(row):
            raise ValueError('overlay manifest schema drift')
        texture = data / 'overlays' / row['file']
        if texture.parent.resolve() != (data / 'overlays').resolve() or not texture.is_file():
            raise ValueError(f'Invalid overlay file: {row["file"]}')
        key = row['key']
        citation = dict(title=row['source'], url='https://aladin.cds.unistra.fr/hips/')
        if key == 'lensing':
            citation = dict(title='Planck 2015 R2 CMB lensing convergence', url='https://pla.esac.esa.int/#cosmology')
        elif key == 'lss':
            citation = CATALOGS[0]['citation']
        elif key == 'icecube':
            citation = dict(title='IceCube public point-source tracks, 2008–2018', url=ICECUBE_URL)
        files = dict(texture='data/overlays/' + row['file'])
        field = {'lensing': 'lensing', 'lss': 'density'}.get(key)
        if field and (data / f'fields/{field}.json').exists():
            files['field'] = f'data/fields/{field}.json'
        layers.append(dict(id='sky.' + key, title=row['label'], kind='skymap', category=row['group'], module='skymap', files=files,
                           schema='equirectangular-icrs-ra-left-v1', citation=citation, license=UNVERIFIED, updated_at=updated(texture),
                           version=sha256(texture.read_bytes())[:16], style=dict(color='#84d9e8', size=1), filters=[],
                           note=row['note'] + ' Display resampling of order-3 HiPS Allsky where applicable, approximately 7 arcmin native samples; for orientation, not photometry. ICRS equirectangular, RA increases left, centre RA=180 deg.'))
    ephemeris = atlas / 'js/vendor/astronomy.js'
    earth_textures = dict(textures='data/textures/sources.json', earthDay='data/textures/earth-day.jpg', earthNight='data/textures/earth-night.jpg') if (data / 'textures/sources.json').exists() else {}
    layers.append(dict(id='solar', title='Solar System', kind='points3d', category='Solar System', module='solar', files=earth_textures, schema='astronomy-engine-body-v1', version='astronomy-engine@2.1.19',
                       citation=dict(title='Astronomy Engine, Don Cross', url='https://github.com/cosinekitty/astronomy'), license='MIT (Astronomy Engine)', updated_at=updated(ephemeris) if ephemeris.exists() else updated(atlas / 'mac-studio/build_web_catalogs.py'),
                       style=dict(color='#ffcb6c', size=5), filters=[], note='Computed at the shared UTC clock by the pinned Astronomy Engine ephemeris library; see Solar System panel for model limits. Earth display uses NASA Blue Marble (August 2004) and Black Marble (2016) historical composites; NASA credit/reuse terms are recorded in data/textures/sources.json.'))
    satellite_folder = data / 'satellites'
    if (satellite_folder / 'gp.json').exists() or (satellite_folder / 'status.json').exists():
        available = (satellite_folder / 'gp.json').exists()
        files = dict(json='data/satellites/gp.json') if available else {}
        for key, name in [('satcat', 'satcat.json'), ('status', 'status.json')]:
            if (satellite_folder / name).exists():
                files[key] = 'data/satellites/' + name
        layers.append(dict(id='satellites', title='Publicly catalogued Earth satellites', kind='points3d', category='Solar System', module='satellites', files=files, schema='celestrak-omm-json',
                           citation=dict(title='CelesTrak public general perturbations and SATCAT', url='https://celestrak.org/'), license='CelesTrak usage policy; reuse license not stated (TODO: verify)', updated_at=updated(satellite_folder / ('gp.json' if available else 'status.json')), available=available,
                           style=dict(color='#84d9e8', size=2), filters=[], note='SGP4 predictions from public element sets, not live telemetry. Element age and catalog completeness are shown in the satellite panel.'))
    result = dict(schema=1, updated_at=max(r['updated_at'] for r in layers), layers=layers)
    write(data / 'layers.json', encode_json(result))
    expected = next(ast.literal_eval(n.value) for n in ast.parse((atlas / 'mac-studio/build_overlays.py').read_text()).body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'SURVEYS' for t in n.targets))
    status_file = data / 'overlays/overlay-status.json'
    overlay_status = json.loads(status_file.read_text()) if status_file.exists() else None
    missing_overlays = [r[0] for r in expected if r[0] not in {o['key'] for o in overlays}]
    failed_overlays = overlay_status and any(row['status'] == 'failed' for row in overlay_status['surveys'])
    status = dict(schema=1, updated_at=max(result['updated_at'], (overlay_status or {}).get('updated_at', '')), status='partial' if missing_overlays or failed_overlays else 'ok', catalogs=[dict(id=c['id'], rows=h['length'], version=h['version'], sha256=h['sha256']) for c, h in catalogs],
                  overlays=dict(available=len(overlays), missing=missing_overlays, last_attempt=overlay_status),
                  acceptance=acceptance_path, volume=dict(status='not_available', note='TODO: no verified public 3D reconstruction grid and redistribution license. A projected lensing or galaxy-density map must never be presented as a 3D density field. See mac-studio/PIPELINE.md.'))
    write(data / 'pipeline-status.json', encode_json(status))
    print(f'Published {len(catalogs)} validated binary catalogs, {len(layers)} layers; {len(overlays)} sky textures')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('atlas_dir', nargs='?', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    parser.add_argument('--source-dir', type=pathlib.Path, default=pathlib.Path.home() / 'cosmic-atlas-catalogs')
    parser.add_argument('--fields', action='store_true')
    args = parser.parse_args()
    data = args.atlas_dir / 'data'
    curated = dict(id='curated', title='Local Group & Boötes III', kind='points3d', color='#e9adff', size=4, citation=dict(title='Hand-maintained Local Group landmarks', url='https://simbad.cds.unistra.fr/simbad/'),
                   note='Approximate hand-maintained distances; method and uncertainty not supplied. Boötes III is a disrupting stellar system / dwarf-galaxy candidate with debated classification.', filters=[dict(field='mpc', type='range', unit='Mpc'), dict(field='name', type='text')])
    outputs = [(curated, *pack_table(*parse_curated(data / 'curated.json'), data / 'curated.json', curated['citation']))]
    for config in CATALOGS:
        source = data / (config['id'] + '.csv')
        outputs.append((config, *pack_table(*parse_catalog(source, config), source, config['citation'])))
    # Validate all catalogs before publishing any replacement binary.
    for config, binary, header in outputs:
        write(data / (config['id'] + '.bin'), binary)
        write(data / (config['id'] + '.header.json'), (json.dumps(header, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode())
        print(config['id'], header['length'], 'rows;', len(binary), 'binary bytes;', header['sha256'])
    acceptance_path = acceptance(args.source_dir, data)
    if acceptance_path is None and (data / 'icecube-acceptance.json').exists():
        acceptance_path = 'data/icecube-acceptance.json'
    if args.fields:
        build_fields(args.source_dir, data)
    registry(args.atlas_dir, [(c, h) for c, _, h in outputs], acceptance_path)


if __name__ == '__main__':
    main()
