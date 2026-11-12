import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

ATLAS=Path(__file__).resolve().parents[2]


def module(name):
    spec=importlib.util.spec_from_file_location(name,ATLAS/'mac-studio'/f'{name}.py')
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


weather=module('fetch_weather')
smallbodies=module('fetch_smallbodies')
MATRIX=b'''<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1"><Contents><Layer><ows:Identifier>MODIS_Terra_Cloud_Fraction_Day</ows:Identifier><TileMatrixSetLink><TileMatrixSet>2km</TileMatrixSet></TileMatrixSetLink></Layer><TileMatrixSet><ows:Identifier>2km</ows:Identifier><TileMatrix><ows:Identifier>1</ows:Identifier><ScaleDenominator>111816452.8057436</ScaleDenominator><TopLeftCorner>-180 90</TopLeftCorner><TileWidth>512</TileWidth><TileHeight>512</TileHeight><MatrixWidth>3</MatrixWidth><MatrixHeight>2</MatrixHeight></TileMatrix></TileMatrixSet></Contents></Capabilities>'''


class WeatherAndEphemerisPublisherTests(unittest.TestCase):
    def test_nasa_tile_matrix_and_image_trust_boundary(self):
        weather.validate_matrix(MATRIX)
        with self.assertRaisesRegex(ValueError,'geometry'):
            weather.validate_matrix(MATRIX.replace(b'<MatrixWidth>3',b'<MatrixWidth>4'))
        stream=io.BytesIO();Image.new('RGBA',(512,512),(102,0,119,255)).save(stream,'PNG')
        image=weather.validate_image(stream.getvalue(),(512,512))
        self.assertEqual(image.getpixel((0,0)),(102,0,119,255))
        with self.assertRaises(ValueError):
            weather.validate_image(stream.getvalue(),(256,256))

    def test_weather_keeps_nasa_colors_and_no_data_and_skips_duplicate_day(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'source';source.mkdir();out=Path(folder)/'out'
            (source/'capabilities.xml').write_bytes(MATRIX)
            (source/'colormap.xml').write_text('<ColorMaps><ColorMap title="Cloud Fraction" units="%"/></ColorMaps>')
            Image.new('RGB',(420,95),(255,0,0)).save(source/'legend.png')
            for row in range(2):
                for col in range(3):
                    image=Image.new('RGBA',(512,512),(102,row,col,255))
                    image.putpixel((0,0),(192,192,192,0))
                    image.save(source/f'tile-{row}-{col}.png')
            self.assertEqual(weather.main(['--output',str(out),'--source-dir',str(source),'--date','2026-01-01']),0)
            image=Image.open(out/'clouds.png')
            self.assertEqual(image.size,(1280,640))
            self.assertEqual(image.getpixel((1,1)),(102,0,0,255))
            self.assertEqual(image.getpixel((512,0)),(192,192,192,0))
            status=json.loads((out/'status.json').read_text())
            self.assertIn('not cloud opacity',status['format'])
            self.assertEqual(len(status['source_urls']),6)
            self.assertEqual(status['remote_status_url'],weather.REMOTE_STATUS_URL)
            status.pop('remote_status_url')
            (out/'status.json').write_text(json.dumps(status))
            with patch.object(weather,'download',side_effect=AssertionError('No network expected')) as fetch:
                self.assertEqual(weather.main(['--output',str(out),'--date','2026-01-01']),0)
                fetch.assert_not_called()
            self.assertEqual(json.loads((out/'status.json').read_text())['remote_status_url'],weather.REMOTE_STATUS_URL)

    def test_weather_error_retains_previous_dated_observation(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)
            (out/'clouds.png').write_bytes(b'previous')
            (out/'status.json').write_text(json.dumps({'available':True,'observation_date':'2025-01-01'}))
            with patch.object(weather,'download',side_effect=RuntimeError('HTTP 503')) as fetch:
                self.assertEqual(weather.main(['--output',folder,'--date','2026-01-01']),1)
                self.assertEqual(fetch.call_count,1)
            self.assertEqual((out/'clouds.png').read_bytes(),b'previous')
            status=json.loads((out/'status.json').read_text())
            self.assertTrue(status['available']);self.assertEqual(status['observation_date'],'2025-01-01')
            self.assertIn('503',status['error'])
            self.assertEqual(status['remote_status_url'],weather.REMOTE_STATUS_URL)

    def test_jpl_version_table_and_coverage_validation(self):
        value={'signature':{'version':'1.2'},'result':'ICRF\n$$SOE\n2461041.5, A.D. 2026-Jan-01,1,2,3,4,5,6,\n2461041.75, A.D. 2026-Jan-01,7,8,9,10,11,12,\n$$EOE'}
        rows,_=smallbodies.parse_vectors(value)
        self.assertEqual(rows[0][1:],[1,2,3,4,5,6])
        self.assertEqual(smallbodies.interpolate(rows,rows[0][0]),[1,2,3])
        with self.assertRaisesRegex(ValueError,'coverage'):
            smallbodies.interpolate(rows,rows[0][0]-1)
        with self.assertRaisesRegex(ValueError,'signature'):
            smallbodies.parse_vectors({**value,'signature':{'version':'3'}})
        with self.assertRaisesRegex(ValueError,'unambiguous'):
            smallbodies.parse_vectors({**value,'result':'multiple matches'})


if __name__=='__main__':
    unittest.main()
