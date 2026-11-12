import importlib.util
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ATLAS = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fetch_satellites', ATLAS / 'mac-studio/fetch_satellites.py')
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)
OMM = json.loads((ATLAS / 'tests/unit/fixtures/skyfield-passes.json').read_text())['omm']


class SatellitePublisherTests(unittest.TestCase):
    def test_verified_group_membership_and_offline_honesty(self):
        rows = [{**OMM, 'OBJECT_NAME': 'COSMOS TEST'}, {**OMM, 'NORAD_CAT_ID': 100001, 'OBJECT_NAME': 'UNKNOWN TEST'}]
        groups = {group: [{**OMM, 'NORAD_CAT_ID': 200000+i}] for i, group in enumerate(fetch.CONSTELLATION_GROUPS)}
        groups['glo-ops'] = [OMM]
        metadata = fetch.annotate_constellations(rows, groups, '2026-11-12T00:00:00Z')
        self.assertEqual(rows[0]['CONSTELLATION'], 'GLONASS')
        self.assertEqual(rows[0]['CONSTELLATION_GROUPS'], ['glo-ops'])
        self.assertFalse(rows[0]['constellationApproximate'])
        self.assertEqual(rows[1]['CONSTELLATION'], 'Unknown')
        self.assertEqual(len(metadata['groups']), 7)
        fetch.annotate_constellations(rows)
        self.assertTrue(rows[0]['constellationApproximate'])
        self.assertNotIn('CONSTELLATION', rows[0])
        with self.assertRaisesRegex(ValueError, 'seven'):
            fetch.annotate_constellations(rows, {'glo-ops': [OMM]})

    def test_gp_schema_and_full_catalog_guard(self):
        self.assertEqual(fetch.parse_gp(json.dumps([OMM]))[0]['NORAD_CAT_ID'], 25544)
        with self.assertRaises(ValueError):
            fetch.parse_gp(json.dumps([{**OMM, 'REF_FRAME': 'GCRS'}]))
        with self.assertRaises(ValueError):
            fetch.parse_gp(json.dumps([{**OMM, 'NORAD_CAT_ID': 12.5}]))
        with self.assertRaisesRegex(ValueError, 'count'):
            fetch.validate_snapshot([OMM])
        rows = [{**OMM, 'NORAD_CAT_ID': i+1, 'EPOCH': '2026-11-12T00:00:00'} for i in range(30000)]
        metrics = fetch.validate_snapshot(rows, datetime(2026, 11, 12, tzinfo=timezone.utc))
        self.assertEqual(metrics['count'], 30000)
        with self.assertRaisesRegex(ValueError, 'freshness'):
            fetch.validate_snapshot(rows, datetime(2026, 11, 20, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, 'coverage'):
            fetch.validate_catalog_coverage(rows, [{'NORAD_CAT_ID': row['NORAD_CAT_ID'], 'OBJECT_TYPE': 'PAY'} for row in rows])
        metadata = [{'NORAD_CAT_ID': row['NORAD_CAT_ID'], 'OBJECT_TYPE': 'R/B' if i < 1000 else 'DEB'} for i, row in enumerate(rows)]
        self.assertEqual(fetch.validate_catalog_coverage(rows, metadata)['R/B'], 1000)

    def test_http_error_suspends_future_requests_and_keeps_old_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            previous = {'fetched_at': '2020-01-01T00:00:00Z', 'objects': [OMM]}
            fetch.atomic_json(out / 'gp.json', previous)
            with patch.object(fetch, 'download', side_effect=RuntimeError('HTTP 403')) as download:
                self.assertEqual(fetch.main(['--output', folder]), 1)
                self.assertEqual(fetch.main(['--output', folder]), 1)
                self.assertEqual(download.call_count, 1)
            self.assertEqual(json.loads((out / 'gp.json').read_text()), previous)
            self.assertTrue(json.loads((out / 'status.json').read_text())['suspended'])

    def test_group_error_stops_batch_before_metadata_and_preserves_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            previous = {'fetched_at': '2020-01-01T00:00:00Z', 'objects': [OMM]}
            fetch.atomic_json(out / 'gp.json', previous)
            payload = json.dumps([OMM])
            with patch.object(fetch, 'download', side_effect=[payload, payload, RuntimeError('group HTTP 403')]) as download:
                self.assertEqual(fetch.main(['--output', folder]), 1)
                self.assertEqual(download.call_count, 3)
                self.assertEqual(download.call_args_list[-1].args[0], 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=JSON')
            self.assertEqual(json.loads((out / 'gp.json').read_text()), previous)
            self.assertTrue(json.loads((out / 'status.json').read_text())['suspended'])
            (out / 'invalid.csv').write_text('not a GP catalog')
            self.assertEqual(fetch.main(['--output', folder, '--gp-file', str(out / 'invalid.csv')]), 1)
            self.assertTrue(json.loads((out / 'status.json').read_text())['suspended'])


if __name__ == '__main__':
    unittest.main()
