"""Scientific conventions and the binary publishing trust boundary."""
import json
import math
import pathlib
import struct
import sys
import tempfile
import unittest

import numpy as np

ATLAS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ATLAS / 'mac-studio'))
import build_overlays as overlays
import build_targets as targets
import build_web_catalogs as catalogs


class PipelineTests(unittest.TestCase):
    def test_equirectangular_pixel_centres(self):
        ra, dec = overlays.grid(4, 2)
        np.testing.assert_array_equal(ra, [[315, 225, 135, 45]] * 2)
        np.testing.assert_array_equal(dec, [[45] * 4, [-45] * 4])
        ra, dec = overlays.grid(360, 180)
        # The nearest centre to Boötes III is x=150, y=63 (RA 209.5, Dec 26.5).
        self.assertAlmostEqual(ra[63, 150], 209.5)
        self.assertAlmostEqual(dec[63, 150], 26.5)

    def test_hips_nested_pixel_orientation(self):
        # Twelve order-zero tiles, 3 tiles per row, 2x2 pixels per tile.
        image = np.arange(8 * 6).reshape(8, 6)
        hp = overlays.allsky_to_healpix(image, order=0)
        # z = interleave(y) | interleave(x)<<1: x steps by two, y by one.
        np.testing.assert_array_equal(hp[:4], [image[0, 0], image[1, 0], image[0, 1], image[1, 1]])
        np.testing.assert_array_equal(hp[12:16], [image[2, 0], image[3, 0], image[2, 1], image[3, 1]])
        self.assertEqual(len(np.unique(hp)), image.size)
        with self.assertRaisesRegex(ValueError, 'dimensions'):
            overlays.allsky_to_healpix(np.zeros((4, 7)), order=0)

    def test_isotropic_declination_band_expectation(self):
        # Equal-solid-angle synthetic isotropic population, integrated exactly.
        # Its expected band and cone counts must give zero residual at every Dec.
        density_per_sr = 50000 / (4 * np.pi)
        for dec in (-89.8, -60, 0, 26.8, 60, 89.8):
            radius = 1.5
            lo, hi = max(-90, dec - radius), min(90, dec + radius)
            band = density_per_sr * 2 * np.pi * (np.sin(np.radians(hi)) - np.sin(np.radians(lo)))
            observed = density_per_sr * 2 * np.pi * (1 - np.cos(np.radians(radius)))
            expected = targets.band_expectation(band, dec, radius)
            self.assertAlmostEqual((observed - expected) / np.sqrt(expected), 0, places=12)

    def test_binary_round_trip_and_idempotence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / 'neutrinos.csv'
            path.write_text('name,ra_deg,dec_deg,angular_error_deg,energy_gev\nalert,209.3,26.8,1.5,4000\n')
            config = catalogs.CATALOGS[1]
            columns, strings = catalogs.parse_catalog(path, config)
            raw, header = catalogs.pack_table(columns, strings, path, config['citation'])
            self.assertEqual(header['length'], 1)
            self.assertEqual(header['sha256'], catalogs.sha256(raw))
            self.assertEqual(header['strings']['name'], ['alert'])
            self.assertAlmostEqual(struct.unpack_from('<f', raw, header['columns'][0]['offset'])[0], 209.3, places=4)
            self.assertTrue(math.isnan(struct.unpack_from('<f', raw, header['columns'][2]['offset'])[0]))
            self.assertEqual((raw, header), catalogs.pack_table(columns, strings, path, config['citation']))
            output = pathlib.Path(folder) / 'out.bin'
            catalogs.write(output, raw)
            timestamp = output.stat().st_mtime_ns
            catalogs.write(output, raw)
            self.assertEqual(timestamp, output.stat().st_mtime_ns)

    def test_refuses_schema_drift_and_invalid_last_row(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / 'fermi.csv'
            path.write_text('name,ra_deg,dec_deg,class,association,unexpected\na,1,2,bcu,,x\n')
            with self.assertRaisesRegex(ValueError, 'schema drift'):
                catalogs.parse_catalog(path, catalogs.CATALOGS[2])
            path.write_text('name,ra_deg,dec_deg,class,association\na,1,2,bcu,\nb,2,91,bcu,\n')
            with self.assertRaisesRegex(ValueError, 'row 3.*Dec'):
                catalogs.parse_catalog(path, catalogs.CATALOGS[2])

    def test_published_binary_checksums_and_lengths(self):
        for key in ('curated', 'galaxies', 'neutrinos', 'fermi'):
            header = json.loads((ATLAS / f'data/{key}.header.json').read_text())
            raw = (ATLAS / f'data/{key}.bin').read_bytes()
            self.assertEqual(catalogs.sha256(raw), header['sha256'])
            self.assertEqual(len(raw), header['length'] * 4 * len(header['columns']))
            for strings in header['strings'].values():
                self.assertEqual(len(strings), header['length'])


if __name__ == '__main__':
    unittest.main()
