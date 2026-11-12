import test from 'node:test';
import assert from 'node:assert/strict';
import {taiMinusUtc,utcToTai,taiToUtc,taiToTT,ttToTai,timeScales,gmst,clockDate} from '../../js/astro/time.js';

test('UTC/TAI/TT preserve the 2016 leap second',()=>{
  const before=utcToTai('2016-12-31T23:59:59Z'),leap=utcToTai('2016-12-31T23:59:60Z'),after=utcToTai('2017-01-01T00:00:00Z');
  assert.equal(leap-before,1000);assert.equal(after-leap,1000);
  assert.equal(taiToUtc(leap+123),'2016-12-31T23:59:60.123Z');
  assert.equal(taiToUtc(after),'2017-01-01T00:00:00.000Z');
  const scales=timeScales('2016-12-31T23:59:60Z');assert.equal(scales.leapSecond,true);assert.equal(scales.taiMs,leap);assert.equal(scales.ttMs,leap+32184);assert.equal(scales.utcMs,null);
  assert.equal(ttToTai(taiToTT(leap)),leap);
  assert.equal(taiMinusUtc('2016-12-31T23:59:59Z'),36);assert.equal(taiMinusUtc('2017-01-01'),37);
  assert.throws(()=>utcToTai('2015-12-31T23:59:60Z'),/no leap second/);
  assert.throws(()=>taiMinusUtc('1971-01-01'),/1972/);
});
test('time scales and IAU 1982 sidereal reference',()=>{
  const scales=timeScales('2000-01-01T12:00:00Z');
  assert.equal(scales.jdUTC,2451545);assert.equal(scales.taiMs-scales.utcMs,32000);assert.equal(scales.ttMs-scales.taiMs,32184);
  assert.ok(Math.abs(gmst('2000-01-01T12:00:00Z')-4.894961212823059)<1e-12);
  for(const value of ['1972-01-01','1985-07-01','1999-12-31T12:34:56.789Z','2026-11-12'])assert.equal(taiToUtc(utcToTai(value)),new Date(value).toISOString());
});
test('clock pause, speed and rewind',()=>{
  const utc='2026-11-12T00:00:00Z';
  assert.equal(clockDate({utc,rate:100,paused:false},2).valueOf()-Date.parse(utc),200000);
  assert.equal(clockDate({utc,rate:-10,paused:false},2).valueOf()-Date.parse(utc),-20000);
  assert.equal(clockDate({utc,rate:100,paused:true},2).valueOf(),Date.parse(utc));
});
