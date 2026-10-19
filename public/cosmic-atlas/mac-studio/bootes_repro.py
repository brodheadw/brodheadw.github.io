#!/usr/bin/env python3
"""Reproduce Ji & Wang (arXiv:2606.01853) on the public IceCube 10-year track release.

Same likelihood as the paper (their eqs.): per-sample unbinned point-source likelihood, Gaussian spatial
signal PDF, signal energy PDF = spectrum x effective area x smearing, data-driven background in
(sin dec, log10 E) bins of 0.02 x 0.1, sample weights from livetime x expected rate, RA scrambles.

Deviation: the DM spectrum is a pure neutrino line at E = m_chi (no HDMSpectra EW continuum).
"""
import argparse,json,pathlib
import numpy as np

ROOT=pathlib.Path.home()/'cosmic-atlas-catalogs/icecube-10yr/icecube_10year_ps'
SAMPLES={'IC40':['IC40'],'IC59':['IC59'],'IC79':['IC79'],'IC86_I':['IC86_I'],
         'IC86_II':['IC86_II','IC86_III','IC86_IV','IC86_V','IC86_VI','IC86_VII']}
E_EDGES=np.round(np.arange(0.5,9.51,0.1),6)
S_EDGES=np.linspace(-1,1,101)
TARGETS={'Bootes III':(209.3,26.8),'LMS-1':(231.9,27.8),'PS1-D':(139.7,0.8),'NGC 1068':(40.667,-0.0069)}

def load(name):
    ev=np.vstack([np.loadtxt(ROOT/f'events/{s}_exp.csv',ndmin=2) for s in SAMPLES[name]])
    up=np.vstack([np.loadtxt(ROOT/f'uptime/{s}_exp.csv',ndmin=2) for s in SAMPLES[name]])
    aeff=np.loadtxt(ROOT/f'irfs/{name}_effectiveArea.csv',ndmin=2)
    sm=np.loadtxt(ROOT/f'irfs/{name}_smearing.csv',ndmin=2)
    logE,err,ra,dec=ev[:,1],np.radians(ev[:,2]),np.radians(ev[:,3]),np.radians(ev[:,4])
    sd=np.sin(dec)
    si=np.clip(np.digitize(sd,S_EDGES)-1,0,len(S_EDGES)-2)
    ei=np.clip(np.digitize(logE,E_EDGES)-1,0,len(E_EDGES)-2)
    h=np.zeros((len(S_EDGES)-1,len(E_EDGES)-1));np.add.at(h,(si,ei),1)
    rows=h.sum(1)
    # background per steradian: P(sin dec)/(2 pi) x P(log E | sin dec); every data event sits in a filled bin
    bsp=rows[si]/(len(sd)*np.diff(S_EDGES)[0])/(2*np.pi)
    ben=h[si,ei]/rows[si]/0.1
    return dict(name=name,N=len(sd),ra=ra,dec=dec,err=err,ei=ei,B=bsp*ben,
                live=(up[:,1]-up[:,0]).sum()*86400,aeff=aeff,sm=sm)

def reco_pdf(sm,lo,hi,dec_deg):
    """log10 E_reco PDF on E_EDGES for true-energy bin [lo,hi) at declination dec_deg."""
    m=(np.isclose(sm[:,0],lo)|((sm[:,0]<=lo)&(sm[:,1]>lo)))&(sm[:,2]<=dec_deg)&(sm[:,3]>dec_deg)
    r=sm[m];pdf=np.zeros(len(E_EDGES)-1)
    for a,b,f in zip(r[:,4],r[:,5],r[:,10]):
        if f<=0:continue
        ov=np.clip(np.minimum(E_EDGES[1:],b)-np.maximum(E_EDGES[:-1],a),0,None)
        pdf+=f*ov/(b-a)
    s=pdf.sum();return pdf/s/0.1 if s>0 else pdf

def hypothesis(sample,dec_deg,flux):
    """flux(lo,hi) -> integral of dPhi/dE over that true-energy bin (any normalisation).
    Returns expected-rate weight (unnormalised) and reco-energy signal PDF."""
    a=sample['aeff'];sm=sample['sm']
    rows=a[(a[:,2]<=dec_deg)&(a[:,3]>dec_deg)]
    smbins=np.unique(sm[:,:2],axis=0)
    pdf=np.zeros(len(E_EDGES)-1);tot=0.
    for lo,hi,_,_,A in rows:
        w=A*flux(lo,hi)
        if w<=0:continue
        c=(lo+hi)/2;b=smbins[(smbins[:,0]<=c)&(smbins[:,1]>c)]
        if not len(b):continue
        p=reco_pdf(sm,b[0,0],b[0,1],dec_deg)
        if p.sum()==0:continue
        pdf+=w*p;tot+=w
    return tot,(pdf/tot if tot else pdf)

def line(m_log):
    return lambda lo,hi:1.0 if lo<=m_log<hi else 0.0

def powerlaw(g):
    return lambda lo,hi:((10**hi)**(1-g)-(10**lo)**(1-g))/(1-g)

class Fit:
    """TS(ns) maximised for many spectral hypotheses at once (vectorised Newton)."""
    def __init__(self,samples,ra0,dec0,hyps,band=np.radians(12)):
        self.s=samples;self.ra0=np.radians(ra0);self.dec0=np.radians(dec0)
        H=len(hyps);K=len(samples)
        rate=np.array([[h[k][0] for k in range(K)] for h in hyps])*np.array([s['live'] for s in samples])
        self.w=rate/rate.sum(1,keepdims=True)                                    # (H,K)
        self.inband=[np.abs(s['dec']-self.dec0)<band for s in samples]
        self.eratio=[np.array([h[k][1][s['ei'][b]] for h in hyps])/s['B'][b]     # (H,n_k) energy-PDF / background
                     for k,(s,b) in enumerate(zip(samples,self.inband))]

    def ts(self,rng=None):
        X=[];far=np.zeros(len(self.s));Ws=[]
        for k,(s,b) in enumerate(zip(self.s,self.inband)):
            ra=s['ra'][b] if rng is None else rng.uniform(0,2*np.pi,b.sum())
            dec=s['dec'][b];sig=s['err'][b]
            c=np.sin(self.dec0)*np.sin(dec)+np.cos(self.dec0)*np.cos(dec)*np.cos(ra-self.ra0)
            psi=np.arccos(np.clip(c,-1,1))
            sp=np.exp(-psi**2/(2*sig**2))/(2*np.pi*sig**2)*np.where(psi>1e-9,psi/np.sin(np.maximum(psi,1e-9)),1)
            R=sp*self.eratio[k]                                                   # (H,n) S/B
            keep=R.max(0)>1e-3
            far[k]=s['N']-keep.sum()
            X.append(self.w[:,k:k+1]/s['N']*(R[:,keep]-1))
            Ws.append(self.w[:,k]/s['N'])
        X=np.concatenate(X,1);Wn=np.stack(Ws,1)                                  # (H,n) and (H,K)
        ns=np.full(X.shape[0],1.0)
        for _ in range(60):
            d=1+ns[:,None]*X;f=1-ns[:,None]*Wn
            g=(X/d).sum(1)-(far*Wn/f).sum(1)
            h=-(X**2/d**2).sum(1)-(far*Wn**2/f**2).sum(1)
            ns=np.clip(ns-g/h,0,500)
        d=1+ns[:,None]*X;f=1-ns[:,None]*Wn
        ts=2*(np.log(d).sum(1)+(far*np.log(f)).sum(1))
        return np.maximum(ts,0),ns

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--trials',type=int,default=0);ap.add_argument('--seed',type=int,default=1)
    ap.add_argument('--target',default='Bootes III');ap.add_argument('--out')
    a=ap.parse_args()
    S=[load(n) for n in SAMPLES];print('events',sum(s['N'] for s in S),'livetime_yr',round(sum(s['live'] for s in S)/3.156e7,2))
    ra,dec=TARGETS[a.target]
    if a.target=='NGC 1068':
        gs=np.round(np.arange(1.5,4.51,0.1),2);hy=[[hypothesis(s,dec,powerlaw(g)) for s in S] for g in gs]
        ts,ns=Fit(S,ra,dec,hy).ts();i=ts.argmax();print(f'NGC 1068 power law: TS={ts[i]:.2f} ns={ns[i]:.1f} gamma={gs[i]}');return
    masses=np.linspace(3,6,101)[:-1]   # 100 log-spaced masses, 1 TeV - 1 PeV
    hy=[[hypothesis(s,dec,line(m)) for s in S] for m in masses]
    fit=Fit(S,ra,dec,hy);ts,ns=fit.ts();i=ts.argmax()
    res=dict(target=a.target,ts=float(ts[i]),ns=float(ns[i]),m_tev=float(10**masses[i]/1e3),
             scan=[[round(10**m/1e3,2),round(float(t),2),round(float(n),1)] for m,t,n in zip(masses,ts,ns)])
    print(f'{a.target}: max TS={ts[i]:.2f} ns={ns[i]:.1f} at m={10**masses[i]/1e3:.1f} TeV')
    if a.trials:
        rng=np.random.default_rng(a.seed);null=np.array([fit.ts(rng)[0].max() for _ in range(a.trials)])
        p=(1+(null>=ts[i]).sum())/(a.trials+1);res.update(trials=a.trials,p_local=p,null_ge=int((null>=ts[i]).sum()))
        np.save(pathlib.Path(a.out or '.').with_suffix('.null.npy') if a.out else 'null.npy',null)
        print(f'local p={p:.2e} ({(null>=ts[i]).sum()} of {a.trials} scrambles >= observed)')
    if a.out:pathlib.Path(a.out).write_text(json.dumps(res,indent=1))

if __name__=='__main__':main()
