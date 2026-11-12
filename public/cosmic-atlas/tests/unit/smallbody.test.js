import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setSmallBodyData,smallBodiesAt,smallBodyState,smallBodyOrbit,smallBodyCoverage,interpolateSmallBody} from '../../js/astro/smallbody.js';

const data=JSON.parse(fs.readFileSync(new URL('../../data/smallbodies/ephemerides.json',import.meta.url)));
const reference=JSON.parse(fs.readFileSync(new URL('../../data/smallbodies/validation.json',import.meta.url)));

test('sampled small bodies match separate Horizons queries at three off-grid dates',t=>{
  setSmallBodyData(data);
  let maximum=0;
  for(const row of reference.cases){
    const body=data.objects.find(body=>body.id===row.id),state=interpolateSmallBody(body.samples,row.jdUTC);
    const error=Math.hypot(...state.position.map((x,i)=>x-row.position[i]));
    const velocityError=Math.hypot(...state.velocity.map((x,i)=>x-row.velocity[i]));
    maximum=Math.max(maximum,error);
    assert.ok(error<.005,`${row.id}: ${error} km`);
    assert.ok(velocityError<.000001,`${row.id}: ${velocityError} km/s`);
  }
  assert.equal(reference.cases.length,24);assert.equal(new Set(reference.cases.map(row=>row.jdUTC)).size,3);
  t.diagnostic(`24 independent Horizons checks, max position interpolation residual ${(maximum*1000).toFixed(3)} m; not physical orbit uncertainty`);
});

test('small-body sampling has hard coverage and keeps heliocentric and geocentric frames explicit',()=>{
  setSmallBodyData(data);
  assert.equal(smallBodyCoverage().count,8);
  assert.deepEqual(smallBodiesAt('2025-12-31T23:59:59Z'),[]);
  assert.deepEqual(smallBodiesAt('2028-01-01T00:00:01Z'),[]);
  assert.equal(smallBodiesAt(data.coverage_start).length,8);
  assert.equal(smallBodiesAt(data.coverage_end).length,8);
  const body=smallBodyState('small:halley','2026-11-12T13:29:00Z',{earthPosition:[1,2,3],earthVelocity:[.1,.2,.3]});
  assert.equal(body.kind,'comet');assert.equal(body.parent,'sun');assert.match(body.frame,/ICRF/);
  assert.deepEqual(body.geocentricPosition,body.position.map((x,i)=>x-[1,2,3][i]));
  assert.ok(body.radiusKm>0);assert.ok(Number.isFinite(body.elements.eccentricity));
  assert.equal(smallBodyState('small:unknown',new Date()),null);
  assert.equal(smallBodyOrbit('small:ceres','2026-11-12',{days:10,samples:16}).length,17);
  assert.deepEqual(smallBodyOrbit('small:ceres','2030-11-12'),[]);
  assert.deepEqual(smallBodyOrbit('small:ceres','2028-02-01'),[]);
});

test('small-body validation rejects malformed data without replacing the working snapshot',()=>{
  setSmallBodyData(data);
  const broken=structuredClone(data);broken.objects[0].samples[1][0]=broken.objects[0].samples[0][0];
  assert.throws(()=>setSmallBodyData(broken),/samples/);
  assert.equal(smallBodyCoverage().count,8);
  assert.throws(()=>setSmallBodyData({...data,frame:'Ecliptic'}),/Unsupported/);
});
