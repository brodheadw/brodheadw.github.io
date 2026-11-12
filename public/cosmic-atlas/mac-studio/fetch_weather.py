#!/usr/bin/env python3
"""Cache a dated NASA MODIS cloud-fraction visualization with its official palette.

This is observed daytime cloud fraction, not a cloud photograph or a forecast.
Six published EPSG:4326 WMTS tiles are mosaicked without color/alpha conversion.
Requires Pillow (already used by the atlas image publishing environment).
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET

LAYER = 'MODIS_Terra_Cloud_Fraction_Day'
BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/'
CAPABILITIES = BASE+'1.0.0/WMTSCapabilities.xml'
COLORMAP = 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Cloud_Fraction.xml'
LEGEND = 'https://gibs.earthdata.nasa.gov/legends/MODIS_Cloud_Fraction_H.png'
REMOTE_STATUS_URL = 'https://raw.githubusercontent.com/brodheadw/brodheadw.github.io/satellite-data/data/weather/status.json'
NS = {'w':'http://www.opengis.net/wmts/1.0', 'o':'http://www.opengis.net/ows/1.1'}


def atomic_bytes(path, contents):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('wb',dir=path.parent,delete=False) as stream:
        stream.write(contents)
        tmp=Path(stream.name)
    tmp.replace(path)


def atomic_json(path, value):
    atomic_bytes(path,(json.dumps(value,separators=(',',':'),allow_nan=False)+'\n').encode())


def download(url):
    req=urllib.request.Request(url,headers={'User-Agent':'CosmicAtlas/4 (brodheadw.github.io; dated NASA weather visualization publisher)'})
    with urllib.request.urlopen(req,timeout=45) as response:
        if response.status!=200:
            raise ValueError(f'NASA GIBS HTTP {response.status}')
        return response.read()


def validate_matrix(xml):
    root=ET.fromstring(xml)
    layer=next((l for l in root.findall('.//w:Layer',NS) if l.findtext('o:Identifier',namespaces=NS)==LAYER),None)
    if layer is None or layer.findtext('w:TileMatrixSetLink/w:TileMatrixSet',namespaces=NS)!='2km':
        raise ValueError('NASA cloud layer changed; review its matrix/legend metadata')
    matrixset=next((l for l in root.findall('.//w:TileMatrixSet',NS) if l.findtext('o:Identifier',namespaces=NS)=='2km'),None)
    matrix=next((m for m in matrixset.findall('w:TileMatrix',NS) if m.findtext('o:Identifier',namespaces=NS)=='1'),None) if matrixset is not None else None
    values={key:matrix.findtext('w:'+key,namespaces=NS) for key in ['TileWidth','TileHeight','MatrixWidth','MatrixHeight','TopLeftCorner']} if matrix is not None else {}
    if values!={'TileWidth':'512','TileHeight':'512','MatrixWidth':'3','MatrixHeight':'2','TopLeftCorner':'-180 90'}:
        raise ValueError('NASA WMTS matrix geometry changed')
    # 0.28 mm OGC pixel and WGS84 degrees; 111816452.8057436 gives .28125 deg/px.
    scale=float(matrix.findtext('w:ScaleDenominator',namespaces=NS))
    if abs(scale*.00028/111319.49079327358-.28125)>1e-10:
        raise ValueError('NASA WMTS resolution changed')


def validate_image(contents,size=None):
    from PIL import Image
    image=Image.open(io.BytesIO(contents))
    image.load()
    if image.format!='PNG' or (size is not None and image.size!=size) or image.width>2048 or image.height>2048:
        raise ValueError('Unexpected NASA cloud tile image')
    return image.convert('RGBA')


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'data/weather')
    parser.add_argument('--date',help='Nominal MODIS data day YYYY-MM-DD; default previous UTC day')
    parser.add_argument('--source-dir',type=Path,help='Offline directory containing capabilities.xml, colormap.xml, legend.png and tile-ROW-COL.png')
    args=parser.parse_args(argv)
    now=datetime.now(timezone.utc)
    date=args.date or (now-timedelta(days=1)).date().isoformat()
    day=datetime.strptime(date,'%Y-%m-%d').replace(tzinfo=timezone.utc)
    if day.date()>=now.date():
        parser.error('Use a completed prior data day, not current/future weather')
    out=args.output
    previous=json.loads((out/'status.json').read_text()) if (out/'status.json').exists() else {}
    previous['remote_status_url']=REMOTE_STATUS_URL
    if not args.source_dir and previous.get('observation_date')==date and previous.get('available') and all((out/name).exists() for name in ['clouds.png','legend.png','colormap.xml']):
        atomic_json(out/'status.json',previous)
        print('Dated cloud fraction already cached; no NASA request made')
        return 0
    def read(name,url):
        return (args.source_dir/name).read_bytes() if args.source_dir else download(url)
    try:
        from PIL import Image
        capabilities=read('capabilities.xml',CAPABILITIES)
        validate_matrix(capabilities)
        colormap=read('colormap.xml',COLORMAP)
        root=ET.fromstring(colormap)
        if root.find("ColorMap[@title='Cloud Fraction']").get('units')!='%':
            raise ValueError('NASA palette units changed')
        legend=read('legend.png',LEGEND)
        validate_image(legend)
        mosaic=Image.new('RGBA',(1536,1024))
        sources=[]
        for row in range(2):
            for col in range(3):
                url=f'{BASE}{LAYER}/default/{date}/2km/1/{row}/{col}.png'
                contents=read(f'tile-{row}-{col}.png',url)
                image=validate_image(contents,(512,512))
                mosaic.paste(image,(col*512,row*512))
                sources.append({'url':url,'sha256':hashlib.sha256(contents).hexdigest()})
        # Matrix tiles extend beyond +180/-90; crop only padded map extent.
        mosaic=mosaic.crop((0,0,1280,640))
        alpha=mosaic.getchannel('A')
        covered=sum(alpha.histogram()[1:])
        coverage=covered/(1280*640)
        if coverage<.05:
            raise ValueError('NASA cloud fraction image is mostly unavailable; retaining previous snapshot')
        stream=io.BytesIO();mosaic.save(stream,format='PNG',optimize=True)
        contents=stream.getvalue()
        timestamp=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
        status={'schema':1,'available':True,'fetched_at':timestamp,'observation_date':date,
                'remote_status_url':REMOTE_STATUS_URL,
                'observation_start':day.isoformat().replace('+00:00','Z'),'observation_end':(day+timedelta(days=1)).isoformat().replace('+00:00','Z'),
                'stale_after_hours':48,'product':'Daytime cloud fraction (Terra / MODIS)',
                'layer':LAYER,'description':'NASA observed daytime cloud fraction, shown with the official 0–100% color scale.',
                'coverage':'Global equirectangular daily swath mosaic; transparent pixels are unavailable, not clear sky.',
                'valid_pixel_fraction':coverage,'projection':'EPSG:4326','bounds':[-180,-90,180,90],
                'width':1280,'height':640,'resolution_degrees':.28125,'resolution_note':'Display samples 0.28125 degrees (~31.3 km at equator); source tile matrix named 2km. Native product resolution differs from this display mosaic.',
                'texture':'data/weather/clouds.png','legend':'data/weather/legend.png','colormap':'data/weather/colormap.xml',
                'format':'RGBA PNG; official NASA color mapping retained. Alpha only marks no-data; it is not cloud opacity.',
                'processing':'Six NASA WMTS level-1 tiles mosaicked and cropped to geographic bounds. No palette, opacity or meteorological-value conversion; no interpolation.',
                'source_url':CAPABILITIES,'source_urls':sources,'documentation':'https://nasa-gibs.github.io/gibs-api-docs/access-basics/',
                'product_documentation':'https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/MOBCFR_C00',
                'attribution':'NASA Terra/MODIS; NASA EOSDIS Global Imagery Browse Services (GIBS)',
                'license':'NASA media reuse guidelines; acknowledge NASA, no endorsement implied',
                'license_url':'https://www.nasa.gov/nasa-brand-center/images-and-media/',
                'sha256':hashlib.sha256(contents).hexdigest(),
                'caveat':'A dated scientific cloud-fraction visualization, not photographic clouds, live weather, forecast, or weather at the selected simulation time. Nominal data-day boundaries are labels; individual swath acquisition times differ. Daylight-only gaps and missing observations remain transparent.'}
        atomic_bytes(out/'clouds.png',contents)
        atomic_bytes(out/'legend.png',legend)
        atomic_bytes(out/'colormap.xml',colormap)
        atomic_json(out/'status.json',status)
        print(f'Published NASA {date} cloud fraction, {1280}x{640}, {coverage:.1%} valid display pixels')
        return 0
    except Exception as error:
        previous.update(schema=1,available=bool(previous.get('available') and (out/'clouds.png').exists()),last_attempt=now.isoformat().replace('+00:00','Z'),error=str(error))
        atomic_json(out/'status.json',previous)
        print(f'Weather refresh stopped; previous dated observation retained: {error}',file=sys.stderr)
        return 1


if __name__=='__main__':
    raise SystemExit(main())
