#!/usr/bin/env python3
"""Download real public catalogs from VizieR TAP into ATLAS_SOURCE_DIR as viewer-ready CSVs."""
import csv,io,os,pathlib,urllib.parse,urllib.request
TAP='https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync'
out=pathlib.Path(os.getenv('ATLAS_SOURCE_DIR',str(pathlib.Path.home()/'cosmic-atlas-catalogs')))
C=299792.458

def query(adql):
    url=TAP+'?'+urllib.parse.urlencode({'REQUEST':'doQuery','LANG':'ADQL','FORMAT':'csv','QUERY':adql})
    with urllib.request.urlopen(url,timeout=300) as r:body=r.read().decode()
    rows=list(csv.DictReader(io.StringIO(body)))
    if not rows:raise SystemExit('Empty VizieR result for: '+adql)
    return rows

def comoving_mpc(z,h0=70,om=.3,n=200):
    # Matches the viewer's flat LCDM so published and imported distances agree.
    dz=z/n;return C/h0*sum(dz/((om*(1+(i+.5)*dz)**3+1-om)**.5) for i in range(n))

def write(name,header,rows):
    tmp=out/(name+'.tmp')
    with tmp.open('w',newline='') as f:w=csv.writer(f);w.writerow(header);w.writerows(rows)
    tmp.replace(out/name);print(name,len(rows))

out.mkdir(parents=True,exist_ok=True)
# Galaxies: UNGC (Karachentsev+2013, measured distances <11 Mpc) + 2MRS (Huchra+2012) beyond 3000 km/s,
# where peculiar velocities stop dominating and UNGC's volume is already covered.
ungc=[(g['Name'],g['RAJ2000'],g['DEJ2000'],g['Dist'],'') for g in query('SELECT Name,RAJ2000,DEJ2000,Dist FROM "J/AJ/145/101/catalog" WHERE Dist IS NOT NULL')]
mrs=[]
for g in query('SELECT ID,SimbadName,RAJ2000,DEJ2000,cz FROM "J/ApJS/199/26/table3" WHERE cz>3000'):
    z=float(g['cz'])/C;mrs.append((g['SimbadName'] or '2MASX J'+g['ID'],g['RAJ2000'],g['DEJ2000'],round(comoving_mpc(z),3),round(z,6)))
write('galaxies.csv',['name','ra_deg','dec_deg','distance_mpc','z'],ungc+mrs)
# Neutrinos: IceCat-1 (Abbasi+2023) track alerts; error = mean of the asymmetric 90% containment bounds.
nu=[]
for e in query('SELECT Alert,RAJ2000,DEJ2000,"E_RAJ2000","e_RAJ2000","E_DEJ2000","e_DEJ2000",Energy FROM "J/ApJS/269/25/table2"'):
    errs=[float(e[k]) for k in ('E_RAJ2000','e_RAJ2000','E_DEJ2000','e_DEJ2000') if e[k]]
    nu.append((e['Alert'],e['RAJ2000'],e['DEJ2000'],round(sum(errs)/len(errs),3) if errs else '',float(e['Energy'])*1000 if e['Energy'] else ''))
write('neutrinos.csv',['name','ra_deg','dec_deg','angular_error_deg','energy_gev'],nu)
# Gamma rays: Fermi-LAT 4FGL-DR4 (14-year source catalog).
fe=[('4FGL '+s['4FGL'].strip(),s['RAJ2000'],s['DEJ2000'],s['Cl1'].strip(),s['Assoc1'].strip()) for s in query('SELECT "4FGL",RAJ2000,DEJ2000,Cl1,Assoc1 FROM "IX/72/4fgldr4"')]
write('fermi.csv',['name','ra_deg','dec_deg','class','association'],fe)
