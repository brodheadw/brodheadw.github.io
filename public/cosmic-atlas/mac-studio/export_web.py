#!/usr/bin/env python3
"""Bundle the Boötes III reproduction into one JSON for the atlas analysis page."""
import glob,json,pathlib,sys
import numpy as np
from scipy.stats import norm
import bootes_repro as b

out=pathlib.Path(sys.argv[1])
here=pathlib.Path(__file__).parent
S=[b.load(n) for n in b.SAMPLES]
ra0,dec0=b.TARGETS['Bootes III']
obs=json.loads((here/'bootes.json').read_text())
best=np.log10(obs['m_tev']*1e3)

# TS map at the best-fit mass, +-4 deg around the target
step=.2;offs=np.round(np.arange(-4,4+1e-9,step),3);tsmap=[]
for dd in offs:
    dec=dec0+dd;fit=b.Fit(S,ra0,dec,[[b.hypothesis(s,dec,b.line(best)) for s in S]])
    row=[]
    for dr in offs:
        fit.ra0=np.radians(ra0+dr/np.cos(np.radians(dec)));row.append(round(float(fit.ts()[0][0]),2))
    tsmap.append(row)

# events within 4 deg
ev=[]
for s in S:
    c=np.sin(np.radians(dec0))*np.sin(s['dec'])+np.cos(np.radians(dec0))*np.cos(s['dec'])*np.cos(s['ra']-np.radians(ra0))
    for i in np.where(c>=np.cos(np.radians(4)))[0]:
        ev.append([round(float(np.degrees(s['ra'][i])),3),round(float(np.degrees(s['dec'][i])),3),
                   round(float(np.degrees(s['err'][i])),2),round(float(b.E_EDGES[s['ei'][i]]+.05),2)])

null=np.concatenate([np.load(f) for f in sorted(glob.glob(str(here/'trials_s*.null.npy')))])
ge=int((null>=obs['ts']).sum());p=(1+ge)/(len(null)+1);post=1-(1-p)**3
edges=np.arange(0,max(16,obs['ts']+2)+.5,.5);hist=np.histogram(np.minimum(null,edges[-1]-1e-9),edges)[0]
others={n:json.loads((here/f).read_text()) for n,f in [('LMS-1','lms1.json'),('PS1-D','ps1d.json')]}

res=dict(target=dict(name='Boötes III',ra=ra0,dec=dec0),
    observed=dict(ts=round(obs['ts'],2),ns=round(obs['ns'],1),m_tev=round(obs['m_tev'],1)),
    trials=dict(n=int(len(null)),ge=ge,p_local=p,sigma_local=float(norm.isf(p)),p_post=post,sigma_post=float(norm.isf(post)),
                hist_edges=edges.round(2).tolist(),hist=hist.tolist()),
    paper=dict(ts=12.2,ns=17,m_tev=26.5,p_local=3.2e-4,sigma_local=3.4,sigma_post=3.1),
    others={k:dict(ts=round(v['ts'],2),ns=round(v['ns'],1)) for k,v in others.items()},
    paper_others={'LMS-1':dict(ts=2.1,ns=7),'PS1-D':dict(ts=0.0,ns=0)},
    validation=dict(name='NGC 1068',ts=17.46,ns=50.0,gamma=3.2,paper_ns=52,paper_gamma=3.2),
    scan=obs['scan'],tsmap=dict(offsets=offs.tolist(),ts=tsmap),events=ev)
out.write_text(json.dumps(res,separators=(',',':')));print('wrote',out,'p_local',p,'post sigma',norm.isf(post))
