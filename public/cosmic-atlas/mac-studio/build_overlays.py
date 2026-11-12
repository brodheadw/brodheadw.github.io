#!/usr/bin/env python3
"""All-sky overlay images for the atlas sky map, plus overlays.json describing them.

Images are equirectangular, ICRS, RA increasing left, centred on RA 180. Most are HiPS surveys, read from
the order-3 Allsky image of whichever mirror answers (CDS, ESA, IRSA, JAXA, IRAP...) and reprojected here;
three are built here: Planck CMB lensing (projected mass, mostly dark matter), nearby galaxy density
(2MRS/UNGC) and the IceCube 10-year excess. Add a survey by adding one SURVEYS row.

Usage: ~/cosmic-atlas-catalogs/.venv/bin/python build_overlays.py [out_dir] [--only key,key]
Needs numpy, pillow, healpy, matplotlib. A survey that cannot be fetched keeps its previous image, if any.
"""
import io, json, pathlib, sys, urllib.parse, urllib.request
import numpy as np
from PIL import Image

CAT = pathlib.Path.home() / 'cosmic-atlas-catalogs'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = pathlib.Path(args[0]) if args else CAT / 'overlays'
ONLY = next((a.split('=', 1)[1].split(',') for a in sys.argv[1:] if a.startswith('--only=')), None)
W, H = 2048, 1024

# Point-source surveys (Swift-BAT, INTEGRAL, DSS, WISE, 2MASS) are left out: at Allsky resolution they are noise and scan stripes.
# key, group, label, HiPS id (None = built below), colour map for single-band skies (None = use the survey's colours), caption
SURVEYS = [
    ('lensing', 'Dark matter & structure', 'Dark matter: Planck CMB lensing', None, None,
     'Planck lensing convergence: how much mass bends the CMB light on its way to us, summed along the line of sight. Most of that mass is dark matter. Orange = more mass than average, blue = less. Wiener-filtered and smoothed 1.5°, so only the large-scale pattern is real; grey is masked (Milky Way and point sources).'),
    ('lss', 'Dark matter & structure', 'Galaxy density, nearby universe (2MRS)', None, None,
     'Where the ~41,000 galaxies of the 2MASS Redshift Survey sit, smoothed over 3°. Galaxies trace the dark-matter cosmic web out to ~400 Mpc. The empty band is the Milky Way blocking the view.'),
    ('ebv', 'Dark matter & structure', 'Dust reddening E(B−V) (SFD)', 'ov-gso/P/EBV/SFD98', ('inferno', 'log'),
     'Schlegel-Finkbeiner-Davis dust reddening: how much our own galaxy dims and reddens everything behind it. Bright = look through with care.'),
    ('cmb', 'Cosmic microwave background', 'CMB temperature (Planck)', 'CDS/P/PLANCK/R3/CMB', ('RdYlBu_r', 'linear'),
     'Planck CMB temperature: the leftover glow of the Big Bang, 380,000 years after it. Red is slightly warmer, blue slightly colder (about ±0.0003 K).'),
    ('cmb_act', 'Cosmic microwave background', 'CMB, high resolution (ACT + Planck)', 'CDS/P/ACT-PLANCK/DR4DR6/Color_CMB', None,
     'Atacama Cosmology Telescope combined with Planck: the CMB at arcminute resolution.'),
    ('wmap', 'Cosmic microwave background', 'Microwave sky 94 GHz (WMAP)', 'CDS/P/WMAP/W/9yr', ('RdYlBu_r', 'linear'),
     "WMAP 9-year W band (94 GHz): the CMB plus our galaxy's own microwave glow along the plane."),
    ('planck_lfi', 'Cosmic microwave background', 'Planck 30-70 GHz colour', 'CDS/P/PLANCK/R2/LFI/color', None,
     'Planck low-frequency instrument, 30/44/70 GHz in colour: CMB fluctuations plus galactic synchrotron and free-free emission.'),
    ('planck_100', 'Cosmic microwave background', 'Planck 100 GHz', 'ESAVO/P/PLANCK/HFI-100-smooth', ('RdYlBu_r', 'linear'),
     'Planck 100 GHz, near the CMB peak: the CMB pattern everywhere except the galactic plane.'),
    ('gamma', 'Gamma rays', 'Gamma-ray sky (Fermi-LAT colour)', 'CDS/P/Fermi/color', None,
     'Fermi-LAT gamma rays. The bright band is our own galaxy; the dots are blazars and pulsars.'),
    ('gamma_hi', 'Gamma rays', 'Gamma rays 3-300 GeV (Fermi)', 'ov-gso/P/Fermi/Band5', ('magma', 'asinh'),
     'Fermi-LAT 3-300 GeV, the highest-energy band: the galactic plane, the Fermi bubbles above and below the galactic centre, and blazars.'),
    ('gamma_lo', 'Gamma rays', 'Gamma rays 100-300 MeV (Fermi)', 'ov-gso/P/Fermi/Band2', ('magma', 'asinh'),
     'Fermi-LAT 100-300 MeV: dominated by cosmic rays hitting interstellar gas.'),
    ('comptel', 'Gamma rays', 'MeV gamma rays (COMPTEL)', 'ov-gso/P/COMPTEL', ('magma', 'asinh'),
     'COMPTEL 0.8-30 MeV: the gap between X-rays and Fermi, dominated by the inner galaxy.'),
    ('egret', 'Gamma rays', 'Gamma rays above 100 MeV (EGRET)', 'CDS/P/EGRET/sup100', ('magma', 'asinh'),
     "EGRET, Fermi's 1990s predecessor, above 100 MeV."),
    ('icecube', 'Neutrinos', 'IceCube 10-year excess', None, None,
     'IceCube 10-year tracks above ~3 TeV: places with more events than average for their declination, dark at 1σ to bright at 4σ. With no trials correction most bright spots are chance; that is the point of the reproduction.'),
    ('xray_soft', 'X-rays', 'X-ray sky (ROSAT)', 'ov-gso/P/RASS', ('magma', 'asinh'),
     'ROSAT all-sky survey, 0.1-2.4 keV: hot gas in our galaxy, supernova remnants, galaxy clusters and active galaxies.'),
    ('xray_maxi', 'X-rays', 'X-ray sky 2-20 keV (MAXI)', 'JAXA/P/MAXI/GSC/Image', None,
     'MAXI on the Space Station, 2-20 keV: X-ray binaries along the galactic plane and the brightest active galaxies.'),
    ('euv', 'X-rays', 'Extreme ultraviolet (ROSAT WFC)', 'CDS/P/ROSATWFC/color', None,
     'ROSAT wide-field camera, extreme ultraviolet: hot white dwarfs and active stars close to the Sun.'),
    ('optical', 'Visible light & stars', 'Milky Way, visible light', 'CDS/P/Mellinger/color', None,
     'The Milky Way in visible light (Mellinger panorama). Dark lanes are dust blocking starlight.'),
    ('gaia', 'Visible light & stars', 'Gaia DR3 colour', 'ESAVO/P/GAIA/DR3-RGB', None,
     "Gaia's 1.8 billion stars rendered by brightness and colour."),
    ('gaia_density', 'Visible light & stars', 'Star density (Gaia DR3)', 'CDS/P/DM/I/355/gaiadr3', ('viridis', 'log'),
     'How many Gaia stars per patch of sky. The two blobs below the plane are the Magellanic Clouds.'),
    ('dust', 'Infrared & dust', 'Galactic dust (Planck 857 GHz)', 'ESAVO/P/PLANCK/HFI-857', ('inferno', 'asinh'),
     'Planck 857 GHz: cold dust in our galaxy glowing in far-infrared.'),
    ('planck_hfi', 'Infrared & dust', 'Planck 353-857 GHz colour', 'CDS/P/PLANCK/R2/HFI/color', None,
     'Planck high-frequency instrument in colour: cold dust filaments threading the galaxy.'),
    ('dust_pol', 'Infrared & dust', 'Polarised dust (Planck)', 'ESAVO/P/Planck-2015-Pol-Dust', ('inferno', 'asinh'),
     'Polarised dust emission: dust grains line up with the galactic magnetic field.'),
    ('iris', 'Infrared & dust', 'Far infrared (IRAS)', 'CDS/P/IRIS/color', None,
     'IRAS 12-100 μm, reprocessed (IRIS): warm dust, star-forming regions and the zodiacal glow of our solar system.'),
    ('akari', 'Infrared & dust', 'Far infrared (AKARI)', 'ESAVO/P/AKARI/color', None,
     'AKARI 65-140 μm in colour: dust heated by young stars.'),
    ('hi', 'Gas & radio', 'Neutral hydrogen (HI4PI)', 'CDS/P/HI4PI/NHI', ('cividis', 'log'),
     'HI4PI 21-cm survey: the column of neutral hydrogen gas. The Magellanic Stream trails below the plane.'),
    ('hi_velocity', 'Gas & radio', 'Hydrogen by velocity (LAB)', 'CAMRAS/P/LABHI/RGB', None,
     'Leiden/Argentine/Bonn HI survey coloured by Doppler shift: gas moving towards (blue) and away (red).'),
    ('halpha', 'Gas & radio', 'Ionised hydrogen (H-alpha)', 'CDS/P/Finkbeiner', ('magma', 'asinh'),
     'H-alpha composite: gas ionised by hot young stars and supernova shocks.'),
    ('wham', 'Gas & radio', 'Ionised hydrogen (WHAM)', 'ov-gso/P/WHAM', ('magma', 'asinh'),
     'Wisconsin H-Alpha Mapper: the faint warm ionised gas that fills the galaxy, at 1° resolution.'),
    ('co', 'Gas & radio', 'Molecular clouds (CO)', 'CDS/P/CO-Dame-2022', ('inferno', 'asinh'),
     'Carbon monoxide: the cold molecular clouds where stars form. Mapped near the galactic plane only.'),
    ('radio', 'Gas & radio', 'Radio 408 MHz (Haslam)', 'ESAVO/P/Haslam408', ('inferno', 'log'),
     'Haslam 408 MHz: synchrotron from cosmic-ray electrons spiralling in the galactic magnetic field. The arc is the North Polar Spur.'),
    ('synchrotron_pol', 'Gas & radio', 'Polarised synchrotron (Planck)', 'ESAVO/P/Planck-2015-Pol-Synchrotron', ('inferno', 'asinh'),
     'Polarised synchrotron from Planck: traces the direction of the galactic magnetic field.'),
]
ICECUBE = CAT / 'icecube-10yr/icecube_10year_ps/events'
LENSING = CAT / 'lensing/data'


def grid(w, h):
    """RA/Dec (deg) of pixel centres: RA increases leftwards, centred on 180."""
    ra = (360 - (np.arange(w) + .5) / w * 360) % 360
    dec = 90 - (np.arange(h) + .5) / h * 180
    return np.meshgrid(ra, dec)


def save(name, rgb):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR).save(OUT / f'{name}.jpg', quality=85)


def colormap(t, stops):
    t = np.clip(t, 0, 1)[..., None]
    xs = np.linspace(0, 1, len(stops))
    stops = np.array(stops, float)
    return np.stack([np.interp(t[..., 0], xs, stops[:, c]) for c in range(3)], -1)


MOCSERVER = 'https://alasky.cds.unistra.fr/MocServer/query'


def get(url, timeout=45):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def interleave(v):
    out = np.zeros_like(v)
    for b in range(16):
        out |= ((v >> b) & 1) << (2 * b)
    return out


def allsky_to_healpix(img, order=3):
    """A HiPS Allsky image (every order-N tile, 27 to a row) -> NESTED HEALPix array.
    Tile pixel (x, y) is sub-pixel interleave(y) | interleave(x) << 1, checked against hips2fits output."""
    n = 12 * 4 ** order
    ncol = int(np.sqrt(n))
    w = img.shape[1] // ncol
    y, x = np.mgrid[0:w, 0:w]
    z = (interleave(y) | (interleave(x) << 1)).ravel()
    m = np.zeros((n * w * w,) + img.shape[2:], float)
    for t in range(n):
        r, c = divmod(t, ncol)
        m[t * w * w + z] = img[r * w:(r + 1) * w, c * w:(c + 1) * w].reshape((w * w,) + img.shape[2:])
    return m


def stretch(v, how):
    """Single-band values -> 0..1 between the 1st and 99.7th percentiles."""
    lo, hi = np.percentile(v[np.isfinite(v)], [1, 99.7])
    t = np.clip((v - lo) / (hi - lo or 1), 0, 1)
    return {'linear': t, 'asinh': np.arcsinh(10 * t) / np.arcsinh(10), 'log': np.log1p(100 * t) / np.log1p(100)}[how]


def hips(name, hips_id, style):
    """Fetch the survey's order-3 Allsky (~7 arcmin) from whichever mirror answers, reproject to the grid.
    shortcut: Allsky resolution only; fetch individual tiles if overlays ever need to be sharper than ~7'."""
    props = json.loads(get(MOCSERVER + '?' + urllib.parse.urlencode(dict(ID=hips_id, fields='hips_service_url*,hips_frame', fmt='json'))))[0]
    urls = sorted((v for k, v in props.items() if k.startswith('hips_service_url')), key=lambda u: 'cds.unistra' in u)  # mirrors first
    raw, errors = None, []
    for url in urls:
        for ext in ('jpg', 'png'):
            try:
                raw = get(f'{url.rstrip("/")}/Norder3/Allsky.{ext}')
                break
            except Exception as e:
                errors.append(f'{url} {ext}: {e}')
        if raw:
            break
    if raw is None:
        raise RuntimeError('; '.join(errors))
    im = Image.open(io.BytesIO(raw))
    rgb = np.asarray(im.convert('RGB'), float)
    m = allsky_to_healpix(rgb)
    sky = healpix_to_grid(m, coord_in='G' if props.get('hips_frame') == 'galactic' else 'C', w=W, h=H, nest=True)
    if style:  # single band: grey levels -> colour map
        from matplotlib import colormaps
        cmap, how = style
        sky = colormaps[cmap](stretch(sky.mean(-1), how))[..., :3] * 255
    else:  # colour survey: faint at Allsky resolution, so bring its 99.5th percentile up to white, lifting shadows if still dark
        sky = np.clip(sky / max(np.percentile(sky.max(-1), 99.5), 1), 0, 1)
        if sky.mean() < .12:
            sky = sky ** .55
        sky *= 255
    save(name, sky)


def healpix_to_grid(m, coord_in='G', w=1024, h=512, nest=False):
    """Sample a HEALPix map (galactic by default) on the equirectangular ICRS grid."""
    import healpy as hp
    ra, dec = grid(w, h)
    theta, phi = np.radians(90 - dec), np.radians(ra)
    if coord_in != 'C':
        theta, phi = hp.Rotator(coord=['C', coord_in])(theta.ravel(), phi.ravel())
        theta, phi = theta.reshape(dec.shape), phi.reshape(dec.shape)
    return m[hp.ang2pix(hp.npix2nside(len(m)), theta, phi, nest=nest)]


def lensing():
    """Wiener-filtered Planck 2015 lensing convergence: kappa_L * C_L/(C_L+N_L), from nlkk.dat (L, N_L, C_L+N_L), smoothed 1.5 deg."""
    import healpy as hp
    klm = hp.read_alm(str(LENSING / 'dat_klm.fits'))
    L, N, CN = np.loadtxt(LENSING / 'nlkk.dat', unpack=True)
    lmax = hp.Alm.getlmax(len(klm))
    wiener = np.zeros(lmax + 1)
    wiener[L.astype(int)[L <= lmax]] = np.clip((CN - N) / CN, 0, 1)[L <= lmax]
    wiener[:8] = 0  # lowest multipoles are not in the release
    kappa = hp.alm2map(hp.almxfl(klm, wiener * hp.gauss_beam(np.radians(1.5), lmax)), 256, lmax=lmax)
    mask = hp.ud_grade(hp.read_map(str(LENSING / 'mask.fits.gz')), 256)
    k = healpix_to_grid(kappa)
    msk = healpix_to_grid(mask) > .5
    s = np.std(k[msk])
    rgb = colormap((k / (3 * s) + 1) / 2, [[30, 70, 160], [80, 140, 210], [12, 16, 24], [230, 150, 60], [255, 230, 150]])
    rgb[~msk] = [40, 44, 52]
    save('lensing', rgb)


def lss():
    """Sky density of 2MRS/UNGC galaxies, smoothed 3 degrees."""
    import csv, healpy as hp
    nside = 128
    ra, dec = [], []
    for r in csv.DictReader(open(CAT / 'galaxies.csv')):
        ra.append(float(r['ra_deg'])); dec.append(float(r['dec_deg']))
    counts = np.bincount(hp.ang2pix(nside, np.radians(90 - np.array(dec)), np.radians(ra)), minlength=hp.nside2npix(nside)).astype(float)
    dens = hp.smoothing(counts, fwhm=np.radians(3))
    d = healpix_to_grid(dens, coord_in='C')
    t = np.log1p(np.maximum(d, 0) / np.median(d[d > 0]))
    rgb = colormap(t / np.percentile(t, 99.5), [[6, 8, 16], [40, 30, 90], [120, 60, 160], [230, 120, 150], [255, 235, 200]])
    save('lss', rgb)


def icecube():
    """Local excess in sigma (no trials correction): events above ~3 TeV reco within 1.5 deg vs the RA-average at that declination."""
    radius_deg, min_log10e = 1.5, 3.5
    ev = np.vstack([np.loadtxt(f, ndmin=2) for f in sorted(ICECUBE.glob('*.csv'))])
    ev = ev[ev[:, 1] >= min_log10e]
    w, h = 720, 360
    ra, dec = np.radians(ev[:, 3]), np.radians(ev[:, 4])
    pra = np.radians(grid(w, 1)[0][0])
    pdec = np.radians(90 - (np.arange(h) + .5) / h * 180)
    cosr = np.cos(np.radians(radius_deg))
    obs = np.zeros((h, w))
    order = np.argsort(dec)
    sd, sr = dec[order], ra[order]
    for j, d in enumerate(pdec):
        lo, hi = np.searchsorted(sd, [d - np.radians(radius_deg), d + np.radians(radius_deg)])
        if hi <= lo:
            continue
        er, ed = sr[lo:hi], sd[lo:hi]
        c = np.sin(d) * np.sin(ed)[None, :] + np.cos(d) * np.cos(ed)[None, :] * np.cos(er[None, :] - pra[:, None])
        obs[j] = (c >= cosr).sum(1)
    exp = obs.mean(1, keepdims=True)
    sig = np.where(exp > 0, (obs - exp) / np.sqrt(np.maximum(exp, 1e-9)), 0)
    save('icecube', colormap(np.clip((sig - 1) / 3, 0, 1) ** .8, [[8, 12, 18], [255, 150, 70]]))


BUILT = {'lensing': lensing, 'lss': lss, 'icecube': icecube}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for key, group, label, hips_id, style, note in SURVEYS:
        if not ONLY or key in ONLY:
            try:
                BUILT[key]() if hips_id is None else hips(key, hips_id, style)
                print('ok', key)
            except Exception as e:  # one unavailable survey should not sink the rest
                print('FAILED', key, e)
        if (OUT / f'{key}.jpg').exists():
            manifest.append(dict(key=key, file=f'{key}.jpg', group=group, label=label, note=note, source=hips_id or 'built on the Mac Studio'))
    (OUT / 'overlays.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(len(manifest), 'overlays in manifest')
