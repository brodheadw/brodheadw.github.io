#!/usr/bin/env python3
"""Neutrino counts towards each nearby galaxy -> data/targets.json (the atlas Targets panel).

Targets: the curated list (data/curated.json) plus catalog galaxies within MAX_MPC (skipping any within
0.3 deg of a curated one). For each, IceCube 10-year public tracks above ~3 TeV (same cut as the excess
overlay) inside RADIUS_DEG, and the number expected by chance: the events in the same declination band,
scaled by the cone's share of that band's solid angle. Acceptance depends strongly on declination;
this reconstructed-energy cut contains far more southern tracks. Raw counts are not source evidence.

Usage: python3 build_targets.py <atlas dir>   (needs numpy)
"""
import csv, json, os, pathlib, sys
import numpy as np
from build_web_catalogs import write

ATLAS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
CAT = pathlib.Path(os.getenv('ATLAS_SOURCE_DIR', str(pathlib.Path.home() / 'cosmic-atlas-catalogs')))
EVENTS = CAT / 'icecube-10yr/icecube_10year_ps/events'
RADIUS_DEG, MIN_LOG10E, MAX_MPC = 1.5, 3.5, 3.0


def unit(ra, dec):
    ra, dec = np.radians(ra), np.radians(dec)
    return np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], -1)


def band_expectation(events_in_band, dec, radius_deg=RADIUS_DEG):
    """Isotropic-in-RA cone expectation using the local declination-band rate."""
    lo, hi = max(-90, dec - radius_deg), min(90, dec + radius_deg)
    band_sr = 2 * np.pi * (np.sin(np.radians(hi)) - np.sin(np.radians(lo)))
    cone_sr = 2 * np.pi * (1 - np.cos(np.radians(radius_deg)))
    return events_in_band * cone_sr / band_sr


def main():
    curated = [t for t in json.loads((ATLAS / 'data/curated.json').read_text()) if t['type'] != 'observer']
    targets = [dict(name=t['name'], ra=t['ra'], dec=t['dec'], mpc=t['kpc'] / 1000, type=t['type'], source='curated') for t in curated]
    cu = unit([t['ra'] for t in curated], [t['dec'] for t in curated])
    for r in csv.DictReader(open(ATLAS / 'data/galaxies.csv')):
        d = float(r['distance_mpc'] or 'nan')
        if not d <= MAX_MPC:
            continue
        ra, dec = float(r['ra_deg']), float(r['dec_deg'])
        if (cu @ unit(ra, dec)).max() > np.cos(np.radians(.3)):
            continue
        targets.append(dict(name=r['name'], ra=ra, dec=dec, mpc=d, type='catalog', source='UNGC/2MRS'))

    ev = np.vstack([np.loadtxt(f, ndmin=2) for f in sorted(EVENTS.glob('*.csv'))])
    ev = ev[ev[:, 1] >= MIN_LOG10E]
    eu, edec = unit(ev[:, 3], ev[:, 4]), ev[:, 4]
    r = np.radians(RADIUS_DEG)
    for t in targets:
        n = int((eu @ unit(t['ra'], t['dec']) >= np.cos(r)).sum())
        lo, hi = max(-90, t['dec'] - RADIUS_DEG), min(90, t['dec'] + RADIUS_DEG)
        band = ((edec >= lo) & (edec <= hi)).sum()
        exp = band_expectation(band, t['dec'])
        t.update(tracks=n, expected=round(float(exp), 1), sigma=round(float((n - exp) / np.sqrt(exp)), 2) if exp > 0 else None)

    targets.sort(key=lambda t: -t['tracks'])
    out = dict(radius_deg=RADIUS_DEG, min_log10e=MIN_LOG10E, max_mpc=MAX_MPC, events=int(len(ev)), targets=targets)
    write(ATLAS / 'data/targets.json', json.dumps(out, indent=1, ensure_ascii=False).encode())
    assert any(t['name'] == 'Boötes III' for t in targets)
    print(len(targets), 'targets;', len(ev), 'events; top:', [(t['name'], t['tracks'], t['expected']) for t in targets[:5]])


if __name__ == '__main__':
    main()
