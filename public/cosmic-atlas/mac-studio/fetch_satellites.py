#!/usr/bin/env python3
"""Publish a validated CelesTrak snapshot; never retry a provider HTTP error.

Policy reviewed 2026-11-12: https://celestrak.org/usage-policy.php
GP updates no more often than 2 h; SATCAT at most daily here. A non-200
suspends unattended fetching until a human explicitly resumes it.
"""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import statistics
import sys
import tempfile
from datetime import datetime, timezone
import urllib.error
import urllib.request

GP_URL = 'https://celestrak.org/pub/TLE/catalog.csv'
ANALYST_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=analyst&FORMAT=JSON'
SATCAT_URL = 'https://celestrak.org/pub/satcat.csv'
POLICY_URL = 'https://celestrak.org/usage-policy.php'
GROUP_DOCUMENTATION = 'https://celestrak.org/NORAD/elements/'
# Verified against the official documentation HTML, 2026-11-12; never sweep all groups.
CONSTELLATION_GROUPS = {'starlink': 'Starlink', 'oneweb': 'OneWeb', 'gps-ops': 'GPS',
                        'galileo': 'Galileo', 'glo-ops': 'GLONASS', 'beidou': 'BeiDou',
                        'iridium-NEXT': 'Iridium'}
# TODO: verify a standalone CelesTrak redistribution license; the published usage policy states operational requirements only.
NUMERIC = ('NORAD_CAT_ID', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
           'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR',
           'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT')


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def parse_date(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False) as stream:
        json.dump(value, stream, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
        stream.write('\n')
        temporary = Path(stream.name)
    temporary.replace(path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        raise urllib.error.HTTPError(request.full_url, code, message, headers, file)


def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CosmicAtlas/4 (brodheadw.github.io; CelesTrak snapshot publisher)'})
    # No automatic retries, redirects, fallback URLs, or browser requests.
    with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
        if response.status != 200:
            raise RuntimeError(f'CelesTrak HTTP {response.status}; fetching suspended')
        return response.read().decode('utf-8-sig')


def parse_gp(text):
    rows = json.loads(text) if text.lstrip().startswith('[') else list(csv.DictReader(io.StringIO(text)))
    if not isinstance(rows, list) or not rows:
        raise ValueError('GP response is not a nonempty table')
    result = []
    for raw in rows:
        row = dict(raw)
        for field in NUMERIC:
            if field not in row or str(row[field]).strip() == '':
                raise ValueError(f'Missing GP column {field}')
            value = float(row[field])
            if not math.isfinite(value):
                raise ValueError(f'Non-finite GP {field}')
            if field == 'NORAD_CAT_ID' and not value.is_integer():
                raise ValueError('GP catalog number is not an integer')
            row[field] = int(value) if field == 'NORAD_CAT_ID' else value
        if row['NORAD_CAT_ID'] <= 0 or row['MEAN_MOTION'] <= 0 or not 0 <= row['ECCENTRICITY'] < 1 or not 0 <= row['INCLINATION'] <= 180:
            raise ValueError('GP orbital elements outside allowed range')
        parse_date(row['EPOCH'])
        for field, expected in [('REF_FRAME', 'TEME'), ('TIME_SYSTEM', 'UTC'), ('MEAN_ELEMENT_THEORY', 'SGP4'), ('CENTER_NAME', 'EARTH')]:
            if row.get(field) and row[field] != expected:
                raise ValueError(f'Unsupported GP {field}={row[field]}')
        result.append(row)
    if len({row['NORAD_CAT_ID'] for row in result}) != len(result):
        raise ValueError('Duplicate GP catalog number')
    return result


def validate_snapshot(rows, now=None, previous_count=None):
    now = now or datetime.now(timezone.utc)
    if not 20000 <= len(rows) <= 150000:
        raise ValueError(f'Full public snapshot has implausible count: {len(rows)}')
    if previous_count and not .7 * previous_count <= len(rows) <= 1.4 * previous_count:
        raise ValueError(f'Catalog count changed excessively: {previous_count} -> {len(rows)}')
    ages = [(now - parse_date(row['EPOCH'])).total_seconds() / 86400 for row in rows]
    if statistics.median(ages) > 3 or min(ages) < -2:
        raise ValueError(f'Epoch freshness failed: median age {statistics.median(ages):.2f} days')
    if 25544 not in {row['NORAD_CAT_ID'] for row in rows}:
        raise ValueError('Full snapshot has no ISS (NORAD 25544)')
    return {'count': len(rows), 'median_epoch_age_days': statistics.median(ages), 'oldest_epoch_age_days': max(ages)}


def parse_satcat(text):
    rows = list(csv.DictReader(io.StringIO(text)))
    required = {'NORAD_CAT_ID', 'OBJECT_NAME', 'OBJECT_TYPE', 'OWNER', 'LAUNCH_DATE', 'DECAY_DATE'}
    if not rows or not required <= rows[0].keys():
        raise ValueError('SATCAT schema drift or empty response')
    for row in rows:
        row['NORAD_CAT_ID'] = int(row['NORAD_CAT_ID'])
    if len({row['NORAD_CAT_ID'] for row in rows}) != len(rows):
        raise ValueError('Duplicate SATCAT catalog number')
    if not 50000 < len(rows) < 200000:
        raise ValueError(f'Implausible SATCAT count {len(rows)}')
    return rows


def validate_catalog_coverage(rows, metadata):
    by_id = {int(row['NORAD_CAT_ID']): row for row in metadata}
    types = {'R/B': 0, 'DEB': 0}
    for row in rows:
        kind = by_id.get(row['NORAD_CAT_ID'], {}).get('OBJECT_TYPE')
        if kind in types:
            types[kind] += 1
    # CelesTrak SATCAT on 2026-11-12 lists 2218 tracked rocket bodies and
    # 10381 tracked debris objects. A payload-only group is not a full catalog.
    if types['R/B'] < 1000 or types['DEB'] < 3000:
        raise ValueError(f'Full-catalog coverage failed: {types}; refusing a payload-only or truncated snapshot')
    return types


def annotate_constellations(rows, groups=None, fetched_at=None):
    if groups is None:
        for row in rows:
            row.pop('CONSTELLATION', None)
            row.pop('CONSTELLATION_GROUPS', None)
            row.update(constellationApproximate=True, constellationMethod='name heuristic only; CelesTrak membership unverified')
        return {'verified': False, 'method': 'name heuristic only; no group snapshot supplied'}
    if set(groups) != set(CONSTELLATION_GROUPS):
        raise ValueError('Constellation snapshot must include all seven documented groups')
    membership = {}
    provenance = []
    for group, label in CONSTELLATION_GROUPS.items():
        entries = groups[group]
        if not entries or not isinstance(entries, list):
            raise ValueError(f'Empty or invalid CelesTrak constellation group {group}')
        values = [float(row['NORAD_CAT_ID']) for row in entries]
        if any(not math.isfinite(value) or not value.is_integer() for value in values):
            raise ValueError(f'Non-integer constellation ID in {group}')
        ids = {int(value) for value in values}
        if len(ids) != len(entries) or any(norad <= 0 for norad in ids):
            raise ValueError(f'Invalid constellation IDs in {group}')
        for norad in ids:
            membership.setdefault(norad, []).append(group)
        provenance.append({'id': group, 'label': label, 'count': len(ids), 'fetched_at': fetched_at,
                           'source': f'https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=JSON',
                           'sha256': hashlib.sha256(json.dumps(sorted(ids)).encode()).hexdigest()})
    for row in rows:
        matched = membership.get(row['NORAD_CAT_ID'], [])
        row.update(CONSTELLATION=CONSTELLATION_GROUPS[matched[0]] if matched else 'Unknown',
                   CONSTELLATION_GROUPS=matched, constellationApproximate=False,
                   constellationMethod='NORAD membership in CelesTrak group snapshots')
    return {'verified': True, 'documentation': GROUP_DOCUMENTATION, 'groups': provenance,
            'method': 'NORAD membership in seven CelesTrak group snapshots; Unknown means outside the queried groups'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/satellites')
    parser.add_argument('--gp-file', type=Path, help='Use an already downloaded GP CSV/JSON (offline)')
    parser.add_argument('--analyst-file', type=Path, help='Use an already downloaded public analyst JSON (offline)')
    parser.add_argument('--satcat-file', type=Path, help='Use an already downloaded SATCAT CSV (offline)')
    parser.add_argument('--groups-file', type=Path, help='Offline JSON map from all seven group IDs to their OMM rows')
    parser.add_argument('--resume-after-error', action='store_true', help='Human acknowledgement after investigating a suspended provider request')
    args = parser.parse_args(argv)
    out = args.output
    state = read_json(out / 'status.json', {})
    offline = args.gp_file is not None
    current = datetime.now(timezone.utc)
    if state.get('suspended') and not offline:
        attempted = parse_date(state['last_attempt'])
        if not args.resume_after_error or (current - attempted).total_seconds() < 7200:
            print(state.get('error', 'Fetching suspended; investigate before explicitly resuming'), file=sys.stderr)
            return 1
    previous = read_json(out / 'gp.json', {})
    if not offline and previous.get('fetched_at') and (current - parse_date(previous['fetched_at'])).total_seconds() < 7200:
        print('Satellite snapshot is under 2 h old; no CelesTrak request made')
        return 0
    state.update(schema=1, last_attempt=now_iso(), source=GP_URL, policy=POLICY_URL)
    try:
        gp_text = args.gp_file.read_text() if offline else download(GP_URL)
        rows = parse_gp(gp_text)
        sources = [GP_URL]
        analyst_count = 0
        if args.analyst_file or not offline:
            analyst = parse_gp(args.analyst_file.read_text() if args.analyst_file else download(ANALYST_URL))
            unique = {row['NORAD_CAT_ID']: row for row in rows}
            for row in analyst:
                old = unique.get(row['NORAD_CAT_ID'])
                if not old or parse_date(row['EPOCH']) > parse_date(old['EPOCH']):
                    unique[row['NORAD_CAT_ID']] = row
            rows = list(unique.values())
            analyst_count = len(analyst)
            sources.append(ANALYST_URL)
        # Bulk GP has no group-membership field. These seven required filter groups
        # are fetched once per six-hour workflow batch for membership, not propagation.
        groups = None
        if args.groups_file:
            groups = json.loads(args.groups_file.read_text())
        elif not offline:
            groups = {}
            for group in CONSTELLATION_GROUPS:
                url = f'https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=JSON'
                groups[group] = parse_gp(download(url))
        group_metadata = annotate_constellations(rows, groups, now_iso())
        metrics = validate_snapshot(rows, current, len(previous.get('objects', [])) or None)
        satcat = read_json(out / 'satcat.json', {})
        stale_metadata = not satcat.get('fetched_at') or (current - parse_date(satcat['fetched_at'])).total_seconds() >= 86400
        if args.satcat_file or (not offline and stale_metadata):
            text = args.satcat_file.read_text() if args.satcat_file else download(SATCAT_URL)
            satcat = {'schema': 1, 'fetched_at': now_iso(), 'source': SATCAT_URL, 'objects': parse_satcat(text)}
        metrics['verified_object_types'] = validate_catalog_coverage(rows, satcat.get('objects', []))
        timestamp = now_iso()
        snapshot = {'schema': 1, 'fetched_at': timestamp, 'source': sources, 'frame': 'TEME',
                    'coverage': 'full-public-with-analyst' if analyst_count else 'bulk-public; analyst inclusion not independently checked',
                    'public_analyst_count': analyst_count, 'license': 'CelesTrak usage policy; standalone reuse license not stated',
                    'constellation_groups': group_metadata,
                    'citation': 'CelesTrak, Dr. T.S. Kelso; USSF 18 SDS GP data',
                    'source_sha256': hashlib.sha256(gp_text.encode()).hexdigest(),
                    'sha256': hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest(), 'objects': rows}
        # Validate all inputs before replacing any previously working GP snapshot.
        if satcat:
            atomic_json(out / 'satcat.json', satcat)
        atomic_json(out / 'gp.json', snapshot)
        was_suspended = state.get('suspended', False) if offline else False
        prior_error = state.get('error') if was_suspended else None
        state.update(available=True, suspended=was_suspended, fetched_at=timestamp, error=prior_error, **metrics)
        atomic_json(out / 'status.json', state)
        print(f'Published {len(rows):,} public objects ({analyst_count:,} public analyst entries); median epoch age {metrics["median_epoch_age_days"]:.2f} days')
        return 0
    except Exception as error:
        state.update(available=bool(previous.get('objects')), suspended=state.get('suspended', False) if offline else True, error=str(error),
                     recovery='Retained last validated snapshot. Investigate the provider response before --resume-after-error; never retry sooner than 2 h.')
        atomic_json(out / 'status.json', state)
        print(f'Satellite snapshot rejected: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
