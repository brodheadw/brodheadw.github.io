#!/usr/bin/env python3
"""Publish normalized public CSVs from Mac Studio to the atlas. No upstream downloads."""
import csv,json,os,pathlib,shutil,subprocess,datetime
repo=pathlib.Path(os.getenv('ATLAS_REPO',str(pathlib.Path.home()/'brodheadw.github.io')))
src=pathlib.Path(os.getenv('ATLAS_SOURCE_DIR',str(pathlib.Path.home()/'cosmic-atlas-catalogs')))
dst=repo/'public/cosmic-atlas/data'
if not (repo/'.git').exists(): raise SystemExit('Missing site git clone: '+str(repo))
dst.mkdir(parents=True,exist_ok=True)
catalogs=[]
for filename,kind,limit in [('galaxies.csv','gal',80000),('neutrinos.csv','nu',30000),('fermi.csv','fermi',15000)]:
    source=src/filename
    if not source.exists(): continue
    with source.open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f);fields={k.lower() for k in (reader.fieldnames or [])}
        if not ({'ra','ra_deg','raj2000'}&fields and {'dec','dec_deg','dej2000'}&fields): raise ValueError('Missing RA/Dec: '+filename)
        if kind=='gal' and not ({'z','redshift','distance_mpc','distance_kpc'}&fields): raise ValueError('Missing distance/redshift: '+filename)
        rows=list(reader)
        if len(rows)>limit: print('WARNING:',filename,'viewer truncates above',limit)
    shutil.copy2(source,dst/filename)
    catalogs.append({'kind':kind,'path':filename,'rows':len(rows)})
(dst/'manifest.json').write_text(json.dumps({'version':1,'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'catalogs':catalogs},indent=2)+'\n')
print('Published manifest:',catalogs)
if '--push' in __import__('sys').argv:
    subprocess.run(['git','-C',str(repo),'add','public/cosmic-atlas/data'],check=True)
    if subprocess.run(['git','-C',str(repo),'diff','--cached','--quiet']).returncode:
        subprocess.run(['git','-C',str(repo),'commit','-m','Refresh atlas catalogs'],check=True)
        subprocess.run(['git','-C',str(repo),'push'],check=True)
