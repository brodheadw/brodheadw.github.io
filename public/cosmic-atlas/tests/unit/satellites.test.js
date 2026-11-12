import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SatelliteCatalog,twoline2satrec,sgp4,temeToGcrs,gcrsToTeme,temeToItrs,gcrsToItrs,itrsToGeodetic,lookAngles,validateGP,elementsFromState} from '../../js/astro/satellites.js';
import {groundTrackSVG,satelliteStateCSV} from '../../js/panels/satellite-inspector.js';

const fixture=(name)=>JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url)));
const difference=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const vallado=fixture('vallado-sgp4'),frames=fixture('astropy-frames'),skyfield=fixture('skyfield-passes');

test('all published Vallado SGP4 verification cases match reference vectors',t=>{
  let maximumPosition=0,maximumVelocity=0,count=0,invalid=0;
  for(const row of vallado.cases){
    const rec=twoline2satrec(row.line1,row.line2);
    for(const sample of row.samples){
      const state=sgp4(rec,sample.minutes);
      if(row.norad===33334){assert.equal(state,null);assert.equal(rec.error,3);invalid++;continue;}
      assert.ok(state,`NORAD ${row.norad} at ${sample.minutes} min`);
      const p=difference([state.position.x,state.position.y,state.position.z],sample.position),v=difference([state.velocity.x,state.velocity.y,state.velocity.z],sample.velocity);
      maximumPosition=Math.max(maximumPosition,p);maximumVelocity=Math.max(maximumVelocity,v);count++;
      assert.ok(p<1e-6,`NORAD ${row.norad}: position ${p} km`);assert.ok(v<1e-8,`NORAD ${row.norad}: velocity ${v} km/s`);
    }
  }
  assert.equal(count,666);assert.equal(invalid,1);
  t.diagnostic(`Vallado: ${count} vectors; max position ${maximumPosition.toExponential(6)} km, velocity ${maximumVelocity.toExponential(6)} km/s; 1 expected invalid orbit`);
});
test('TEME/GCRS/ITRS conversions agree with Astropy + ERFA',t=>{
  let maximumGcrs=0,maximumItrs=0;
  for(const row of frames.cases){
    const gcrs=temeToGcrs(row.position,row.utc),itrs=temeToItrs(row.position,row.utc,row.eop);
    const gerror=difference(gcrs,row.gcrs),ierror=difference(itrs,row.itrs);
    maximumGcrs=Math.max(maximumGcrs,gerror);maximumItrs=Math.max(maximumItrs,ierror);
    assert.ok(gerror<.003,`GCRS reduced-nutation error ${gerror} km`);assert.ok(ierror<.00002,`ITRS error ${ierror} km`);
    assert.ok(difference(gcrsToTeme(gcrs,row.utc),row.position)<1e-8);
    assert.ok(difference(gcrsToItrs(gcrs,row.utc,row.eop),itrs)<1e-8);
    const geo=itrsToGeodetic(itrs);assert.ok(Math.abs(geo.latitude-row.geodetic[0])<1e-6);assert.ok(Math.abs(geo.longitude-row.geodetic[1])<1e-6);assert.ok(Math.abs(geo.altitudeKm-row.geodetic[2])<.00002);
  }
  assert.deepEqual(itrsToGeodetic([0,0,6756.7523142]),{latitude:90,longitude:0,altitudeKm:400});
  t.diagnostic(`Astropy: max GCRS approximation ${(maximumGcrs*1000).toFixed(3)} m at 7348 km radius; EOP-aware ITRS ${(maximumItrs*1000).toFixed(3)} m`);
});
test('ISS look angles and 21 passes agree with Skyfield at three locations',t=>{
  const catalog=new SatelliteCatalog({objects:[skyfield.omm]});let maximumTime=0,passCount=0;
  for(const row of skyfield.cases){
    const rec=catalog.state(0,row.lookUtc),look=lookAngles(rec.position,rec.velocity,row.lookUtc,row.observer,row.eop);
    assert.ok(Math.abs(look.azimuth-row.look.azimuth)<.00005);assert.ok(Math.abs(look.elevation-row.look.elevation)<.00005);assert.ok(Math.abs(look.rangeKm-row.look.rangeKm)<.004);
    const actual=catalog.passes({id:25544,date:skyfield.start,observer:row.observer,hours:skyfield.hours,eop:row.eop}).passes;
    assert.equal(actual.length,row.passes.length);
    actual.forEach((pass,i)=>{
      for(const event of ['rise','culmination','set']){const seconds=Math.abs(Date.parse(pass[event])-Date.parse(row.passes[i][event]))/1000;maximumTime=Math.max(maximumTime,seconds);assert.ok(seconds<.3,`${event}: ${seconds} s`);}
      assert.ok(Math.abs(pass.maxElevation-row.passes[i].maxElevation)<.001);passCount++;
    });
  }
  t.diagnostic(`Skyfield: ${passCount} passes; max rise/culmination/set residual ${maximumTime.toFixed(3)} s`);
});
test('catalog vectors, metadata, orbital elements and measurement are coherent',()=>{
  const rows=[skyfield.omm,{...skyfield.omm,NORAD_CAT_ID:100001,OBJECT_NAME:'Test object',MEAN_ANOMALY:90}];
  const catalog=new SatelliteCatalog({objects:rows},{objects:[{NORAD_CAT_ID:25544,OBJECT_TYPE:'PAY',OWNER:'ISS',LAUNCH_DATE:'1998-11-20'}]});
  const at=skyfield.cases[0].lookUtc,update=catalog.update(at,skyfield.cases[0].observer);
  assert.equal(update.positions.length,6);assert.equal(update.valid[0],1);assert.equal(catalog.objects[1].norad,100001);
  assert.equal(catalog.objects[0].constellationApproximate,true);
  const verified=new SatelliteCatalog({objects:[{...skyfield.omm,OBJECT_NAME:'COSMOS TEST',CONSTELLATION:'GLONASS',CONSTELLATION_GROUPS:['glo-ops'],constellationApproximate:false}]});
  assert.equal(verified.objects[0].constellation,'GLONASS');assert.equal(verified.objects[0].constellationApproximate,false);
  const details=catalog.details({id:25544,date:at,observer:skyfield.cases[0].observer,windowOrbits:.1});
  assert.ok(details.altitudeKm>350&&details.altitudeKm<450);assert.ok(details.speedKmS>7.4&&details.speedKmS<7.9);assert.ok(details.trajectory.length>100);
  assert.equal(details.objectType,'PAY');assert.equal(details.regime,'LEO');
  assert.ok(['sunlit','penumbra','umbra'].includes(details.illumination));
  assert.equal(catalog.measure({a:25544,b:25544,date:at}).distanceKm,0);
  assert.equal(catalog.measure({a:'ground',b:'moon',date:at,observer:skyfield.cases[0].observer}).lineOfSight.length>0,true);
  assert.equal(catalog.measure({a:'observer',b:'observer',date:at,observer:{lat:40.7,lon:-74,height:0}}).lineOfSight,'clear');
  const elements=elementsFromState([7000,0,0],[0,7.5,1]);assert.ok(elements.eccentricity>=0&&elements.eccentricity<.1);assert.ok(elements.periodMinutes>90&&elements.periodMinutes<110);
  assert.equal(catalog.statistics().total,2);
  assert.throws(()=>validateGP({...skyfield.omm,ECCENTRICITY:2}),/range/);
  assert.throws(()=>validateGP({...skyfield.omm,REF_FRAME:'GCRS'}),/Unsupported/);
  assert.throws(()=>new SatelliteCatalog({objects:[skyfield.omm,skyfield.omm]}),/Duplicate/);
  assert.throws(()=>catalog.details({id:25544,date:at,windowOrbits:NaN}),/window/);
  assert.throws(()=>catalog.passes({id:25544,date:at,hours:NaN,observer:skyfield.cases[0].observer}),/window/);
  const csv=satelliteStateCSV(details);assert.match(csv,/temePosition_x/);assert.match(csv,/mean_meanMotion/);assert.equal(csv.trim().split('\n').length,2);
  const track=groundTrackSVG([{longitude:179,latitude:0,sunlit:true,utc:at},{longitude:-179,latitude:1,sunlit:false,utc:at}],details);
  assert.equal((track.match(/<line /g)||[]).length,0,'ground tracks do not draw across the antimeridian');
});
test('close-approach worker algorithm identifies coincident test orbits',async()=>{
  const catalog=new SatelliteCatalog({objects:[skyfield.omm,{...skyfield.omm,NORAD_CAT_ID:100001,OBJECT_NAME:'Coincident verification orbit'}]});
  const result=await catalog.closeApproaches({id:25544,date:skyfield.cases[0].lookUtc,hours:1,distanceKm:.01});
  assert.equal(result.encounters.length,1);assert.ok(result.encounters[0].distanceKm<1e-10);assert.match(result.caveat,/not an official/);
});
