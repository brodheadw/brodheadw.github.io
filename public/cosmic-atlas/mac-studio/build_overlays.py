#!/usr/bin/env python3
"""All-sky overlay images for the atlas sky map: equirectangular, ICRS, RA increasing left, centred RA 180."""
import pathlib,sys,urllib.parse,urllib.request
import numpy as np
from PIL import Image

OUT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else pathlib.Path.home()/'cosmic-atlas-catalogs/overlays')
W,H=2048,1024
HIPS={'cmb':dict(hips='CDS/P/PLANCK/R3/CMB',cmap='RdYlBu_r',stretch='linear'),
      'gamma':dict(hips='CDS/P/Fermi/color'),
      'optical':dict(hips='CDS/P/Mellinger/color'),
      'dust':dict(hips='CDS/P/PLANCK/R3/HFI857',cmap='inferno',stretch='asinh')}
ICECUBE=pathlib.Path.home()/'cosmic-atlas-catalogs/icecube-10yr/icecube_10year_ps/events'

def fetch(name,params):
    q=dict(width=W,height=H,projection='CAR',coordsys='icrs',ra=180,dec=0,fov=360,format='png',**params)
    url='https://alasky.cds.unistra.fr/hips-image-services/hips2fits?'+urllib.parse.urlencode(q)
    with urllib.request.urlopen(url,timeout=600) as r:png=r.read()
    tmp=OUT/f'{name}.tmp.png';tmp.write_bytes(png)
    Image.open(tmp).convert('RGB').save(OUT/f'{name}.jpg',quality=85);tmp.unlink();print(name)

def icecube_excess(radius_deg=1.5,min_log10e=3.5):
    """Local excess in sigma (no trials correction): events above ~3 TeV reco within radius vs the RA-average at that declination."""
    ev=np.vstack([np.loadtxt(f,ndmin=2) for f in sorted(ICECUBE.glob('*.csv'))]);ev=ev[ev[:,1]>=min_log10e]
    w,h=720,360;ra,dec=np.radians(ev[:,3]),np.radians(ev[:,4])
    # pixel centres
    pra=np.radians(180-(np.arange(w)+.5)/w*360+180)%(2*np.pi);pdec=np.radians(90-(np.arange(h)+.5)/h*180)
    cosr=np.cos(np.radians(radius_deg));obs=np.zeros((h,w))
    order=np.argsort(dec);sd=dec[order];sr=ra[order]
    for j,d in enumerate(pdec):
        lo,hi=np.searchsorted(sd,[d-np.radians(radius_deg),d+np.radians(radius_deg)])
        if hi<=lo:continue
        er,ed=sr[lo:hi],sd[lo:hi]
        c=np.sin(d)*np.sin(ed)[None,:]+np.cos(d)*np.cos(ed)[None,:]*np.cos(er[None,:]-pra[:,None])
        obs[j]=(c>=cosr).sum(1)
    exp=obs.mean(1,keepdims=True)
    sig=np.where(exp>0,(obs-exp)/np.sqrt(np.maximum(exp,1e-9)),0)
    # excesses only: below 1 sigma stays dark, saturates at 4 sigma
    t=np.clip((sig-1)/3,0,1)[...,None]
    dark=np.array([8,12,18.]);hot=np.array([255,150,70.])
    rgb=dark+(hot-dark)*t**.8
    Image.fromarray(rgb.astype(np.uint8)).resize((W,H),Image.BILINEAR).save(OUT/'icecube.jpg',quality=88);print('icecube',float(sig.max()))

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    for k,v in HIPS.items():fetch(k,v)
    icecube_excess()
