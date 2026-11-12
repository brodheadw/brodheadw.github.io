import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bodiesAt,solarOrbit,EPHEMERIS} from '../../js/astro/solar.js';
import {stateElements} from '../../js/astro/orbits.js';

const references=JSON.parse(fs.readFileSync(new URL('./fixtures/jpl-horizons.json',import.meta.url)));
test('planets and Moon agree with JPL Horizons on three dates',t=>{
  let maximum=0;
  for(const row of references.cases){
    const body=bodiesAt(row.utc).find(body=>body.name===row.name);
    const actual=row.center==='Earth'?body.geocentricPosition:body.position;
    const cosine=actual.reduce((sum,x,i)=>sum+x*row.position[i],0)/(Math.hypot(...actual)*Math.hypot(...row.position));
    const arcminutes=Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI*60;
    maximum=Math.max(maximum,arcminutes);assert.ok(arcminutes<1,`${row.name} ${row.utc}: ${arcminutes} arcmin`);
    assert.ok(body.velocity.every(Number.isFinite));
  }
  assert.equal(new Set(references.cases.map(row=>row.utc)).size,3);
  t.diagnostic(`JPL Horizons: 30 state comparisons, max angular error ${maximum.toFixed(6)} arcmin (library target 1 arcmin)`);
});
test('Solar System includes Earth, Moon and verified Galilean moons at true distances',()=>{
  const bodies=bodiesAt('2026-11-12T00:00:00Z'),earth=bodies.find(b=>b.id==='earth'),moon=bodies.find(b=>b.id==='moon');
  assert.equal(earth.geocentricDistanceKm,0);assert.ok(moon.geocentricDistanceKm>350000&&moon.geocentricDistanceKm<410000);
  assert.equal(bodies.length,15);assert.equal(EPHEMERIS.version,'2.1.19');
  for(const name of ['io','europa','ganymede','callisto'])assert.equal(bodies.find(b=>b.id===name).parent,'jupiter');
  const orbit=solarOrbit('Earth','2026-11-12T00:00:00Z',32);assert.equal(orbit.length,33);
  assert.ok(orbit.every(p=>p.length===3&&p.every(Number.isFinite)));
  assert.deepEqual(solarOrbit('Not a body',new Date()),[]);
});
test('osculating elements handle circular inclined and eccentric equatorial orbits',()=>{
  const mu=398600.8,radius=7000,velocity=Math.sqrt(mu/radius),radians=Math.PI/180;
  const rotate=([x,y,z])=>{const yy=y*Math.cos(45*radians)-z*Math.sin(45*radians),zz=y*Math.sin(45*radians)+z*Math.cos(45*radians);return [x*Math.cos(30*radians)-yy*Math.sin(30*radians),x*Math.sin(30*radians)+yy*Math.cos(30*radians),zz];};
  const circular=stateElements(rotate([radius*.5,radius*Math.sqrt(3)/2,0]),rotate([-velocity*Math.sqrt(3)/2,velocity*.5,0]),mu);
  assert.ok(Math.abs(circular.trueAnomaly-60)<1e-6);assert.ok(Math.abs(circular.inclination-45)<1e-6);assert.ok(Math.abs(circular.raan-30)<1e-6);
  const e=.2,a=9000,p=a*(1-e*e),r=p/(1+e*.5),speed=Math.sqrt(mu/p);
  const rz=([x,y,z])=>[(x-y)/Math.sqrt(2),(x+y)/Math.sqrt(2),z];
  const equatorial=stateElements(rz([r*.5,r*Math.sqrt(3)/2,0]),rz([-speed*Math.sqrt(3)/2,speed*(e+.5),0]),mu);
  assert.ok(Math.abs(equatorial.argumentOfPerigee-45)<1e-6);assert.ok(Math.abs(equatorial.trueAnomaly-60)<1e-6);assert.ok(Math.abs(equatorial.eccentricity-e)<1e-10);
});
