#!/usr/bin/env python3
"""Cache a bounded representative set of JPL Horizons trajectories, never extrapolated.

JPL fair use: one request at a time, application User-Agent, cached responses,
no browser API access and no automatic retries. https://ssd-api.jpl.nasa.gov/doc/
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import tempfile
import urllib.parse
import urllib.request

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
SBDB = 'https://ssd-api.jpl.nasa.gov/sbdb.api'
BODIES = [('ceres', '1', 'asteroid'), ('vesta', '4', 'asteroid'), ('eros', '433', 'asteroid'),
          ('bennu', '101955', 'asteroid'), ('apophis', '99942', 'asteroid'),
          ('halley', '1P', 'comet'), ('67p', '67P', 'comet'), ('encke', '2P', 'comet')]
CHECK_DATES = ['2026-02-13 03:17:00', '2026-11-12 13:29:00', '2027-10-21 09:41:00']


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False) as stream:
        json.dump(value, stream, separators=(',', ':'), allow_nan=False)
        stream.write('\n')
        tmp = Path(stream.name)
    tmp.replace(path)


def request_json(url, cache):
    path = cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
    if path.exists():
        data = json.loads(path.read_text())
        data.setdefault('_cache_retrieved_at', datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace('+00:00','Z'))
        return data
    req = urllib.request.Request(url, headers={'User-Agent': 'CosmicAtlas/4 (https://brodheadw.github.io/cosmic-atlas/; contact https://github.com/brodheadw/brodheadw.github.io/issues)'})
    with urllib.request.urlopen(req, timeout=60) as response:
        if response.status != 200:
            raise ValueError(f'JPL HTTP {response.status}')
        data = json.load(response)
    if data.get('error'):
        raise ValueError(str(data['error']))
    data['_cache_retrieved_at'] = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    atomic_json(path, data)
    return data


def parse_vectors(data):
    if data.get('signature', {}).get('version') != '1.2':
        raise ValueError('Horizons API signature changed; review documentation')
    result = data.get('result', '')
    if '$$SOE' not in result or '$$EOE' not in result:
        raise ValueError('Horizons did not return an unambiguous vector table')
    rows = []
    for line in result.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
        fields = next(csv.reader([line]))
        row = [float(fields[0])] + [float(x) for x in fields[2:8]]
        if len(row) != 7 or not all(math.isfinite(x) for x in row):
            raise ValueError('Invalid Horizons vector')
        if rows and row[0] <= rows[-1][0]:
            raise ValueError('Horizons timestamps are not increasing')
        rows.append(row)
    if len(rows) < 2:
        raise ValueError('Insufficient Horizons samples')
    return rows, result.split('$$SOE')[0].strip()


def interpolate(rows, jd):
    import bisect
    i = min(len(rows)-2, max(0, bisect.bisect_right([row[0] for row in rows], jd)-1))
    a, b = rows[i:i+2]
    if not a[0] <= jd <= b[0]:
        raise ValueError('Outside sample coverage')
    dt = (b[0]-a[0])*86400
    t = (jd-a[0])/(b[0]-a[0])
    return [(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*dt*a[k+3]+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*dt*b[k+3] for k in range(1,4)]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'data/smallbodies')
    parser.add_argument('--cache', type=Path, default=Path.home()/'cosmic-atlas-catalogs/jpl-smallbodies')
    args = parser.parse_args(argv)
    timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    objects, checks = [], []
    try:
        for key, designation, kind in BODIES:
            sburl = SBDB + '?' + urllib.parse.urlencode({'sstr': designation, 'phys-par': '1', 'full-prec': '1'})
            sb = request_json(sburl, args.cache)
            if sb.get('signature', {}).get('version') != '1.3' or 'object' not in sb:
                raise ValueError('SBDB API schema changed or ambiguous object')
            spkid = sb['object']['spkid']
            # Comets have multiple apparition solutions; select the last before
            # our coverage year as recommended by the Horizons manual.
            target = "'DES="+(designation+';CAP<2026;' if kind == 'comet' else spkid+';')+"'"
            parameters = {'format': 'json', 'COMMAND': target, 'EPHEM_TYPE': 'VECTORS', 'CENTER': '500@10',
                          'REF_PLANE': 'FRAME', 'REF_SYSTEM': 'ICRF', 'VEC_CORR': 'NONE', 'OUT_UNITS': 'KM-S',
                          'VEC_TABLE': '2', 'CSV_FORMAT': 'YES', 'TIME_TYPE': 'UT', 'TIME_DIGITS': 'SECONDS',
                          'CAL_TYPE': 'GREGORIAN', 'OBJ_DATA': 'YES'}
            query = API + '?' + urllib.parse.urlencode({**parameters, 'START_TIME': '2026-01-01', 'STOP_TIME': '2028-01-01', 'STEP_SIZE': "'6 h'"})
            vector_data = request_json(query, args.cache)
            vectors, header = parse_vectors(vector_data)
            if len(vectors) != 2921 or any(abs(b[0]-a[0]-.25)>1e-8 for a,b in zip(vectors,vectors[1:])):
                raise ValueError('Unexpected Horizons coverage or cadence')
            physical = {p['name']: p for p in sb.get('phys_par', [])}
            diameter = physical.get('diameter')
            radius = float(diameter['value'])/2 if diameter and diameter.get('units') == 'km' else None
            body = {'id':'small:'+key, 'name':sb['object']['fullname'].strip(), 'kind':kind, 'spkid':spkid,
                    'designation':designation, 'radiusKm':radius, 'radiusSource':diameter,
                    'source':query, 'sbdbSource':sburl, 'orbitSolution':sb.get('orbit', {}).get('orbit_id'),
                    'orbitSolutionDate':sb.get('orbit', {}).get('soln_date'), 'orbitClass':sb['object'].get('orbit_class'),
                    'horizonsHeader':header, 'samples':vectors}
            check_query = API + '?' + urllib.parse.urlencode({**parameters, 'TLIST': ' '.join("'"+d+"'" for d in CHECK_DATES), 'TLIST_TYPE':'CAL'})
            check_data = request_json(check_query, args.cache)
            reference, _ = parse_vectors(check_data)
            body['source_retrieved_at'] = {'horizons':vector_data['_cache_retrieved_at'], 'sbdb':sb['_cache_retrieved_at'], 'validation':check_data['_cache_retrieved_at']}
            errors = []
            for row in reference:
                error = math.dist(interpolate(vectors,row[0]),row[1:4])
                errors.append(error)
                checks.append({'id':body['id'], 'jdUTC':row[0], 'position':row[1:4], 'velocity':row[4:7], 'source':check_query})
            if max(errors)>5:
                raise ValueError(f'{body["name"]} interpolation exceeds 5km reference tolerance')
            body['validationMaxKm'] = max(errors)
            objects.append(body)
            print(f'{body["name"]}: {len(vectors)} vectors, max off-grid residual {max(errors):.6f} km', flush=True)
        retrieved = max(date for body in objects for date in body['source_retrieved_at'].values())
        data = {'schema':1, 'fetched_at':retrieved, 'published_at':timestamp, 'provider':'NASA/JPL Horizons + SBDB',
                'documentation':'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
                'coverage_start':'2026-01-01T00:00:00Z', 'coverage_end':'2028-01-01T00:00:00Z',
                'frame':'Heliocentric ICRF equatorial', 'units':'km, km/s', 'time_system':'UTC',
                'step_hours':6, 'interpolation':'Cubic Hermite position and analytic derivative velocity; no extrapolation',
                'caveat':'Eight representative small bodies, not all known asteroids/comets. Geometric states; no light time/aberration. Numerical interpolation residual is not physical orbit uncertainty. Future UTC assumes current leap-second knowledge.',
                'objects':objects}
        atomic_json(args.output/'ephemerides.json',data)
        atomic_json(args.output/'validation.json',{'schema':1,'fetched_at':retrieved,'cases':checks})
        atomic_json(args.output/'status.json',{'schema':1,'available':True,'fetched_at':retrieved,'published_at':timestamp,'count':len(objects),'coverage_start':data['coverage_start'],'coverage_end':data['coverage_end'],'max_validation_error_km':max(b['validationMaxKm'] for b in objects)})
        return 0
    except Exception as error:
        atomic_json(args.output/'status.json',{'schema':1,'available':(args.output/'ephemerides.json').exists(),'last_attempt':timestamp,'error':str(error)})
        print(f'JPL refresh stopped; previous snapshot retained: {error}',file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
