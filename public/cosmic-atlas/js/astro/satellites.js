import {json2satrec,twoline2satrec} from '../vendor/satellite/dist/io.js';
import {sgp4} from '../vendor/satellite/dist/propagation.js';
import {geodeticToEcf,eciToGeodetic,ecfToLookAngles} from '../vendor/satellite/dist/transforms.js';
import {shadowFraction} from '../vendor/satellite/dist/shadow.js';
import {checkForDecay} from '../vendor/satellite/dist/propagation/check-for-decay.js';
import {Astronomy,astroTime,bodiesAt,AU_KM} from './solar.js';
import {gmst,julianDate,validDate} from './time.js';
import {stateElements} from './orbits.js';

const DEG=Math.PI/180, MU=398600.8, R_EARTH=6378.135, OMEGA=7.29211514670698e-5;
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a)=>Math.hypot(...a);
const array=(v)=>[v.x,v.y,v.z];
const object=([x,y,z])=>({x,y,z});
const rotateZ=(v,a)=>[v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a),v[2]];
const matVec=(m,v)=>m.map(row=>dot(row,v));
const transpose=(m)=>m[0].map((_,i)=>m.map(row=>row[i]));
const multiply=(a,b)=>a.map(row=>transpose(b).map(column=>dot(row,column)));
// IAU 2000 frame bias: J2000 mean equator -> GCRS (transpose of SOFA bp00's rb).
const BIAS=[[1,7.078279477857337e-8,-8.056217380986972e-8],
  [-7.078279744199226e-8,1,-3.306040883980552e-8],[8.056217146976134e-8,3.3060414542221364e-8,1]];

export const SATELLITE_SCIENCE={library:'satellite.js 7.1.0',license:'MIT',source:'https://github.com/shashwatak/satellite-js/tree/7.1.0',
  frame:'GCRS approximate (IAU2000B)',
  caveat:'Predictions from public GP elements, not telemetry. Accuracy degrades with element age and manoeuvres. Public catalogs omit restricted and untracked objects.',
  earthFixedNote:'ITRS uses supplied UT1−UTC and polar motion; without EOP, UT1=UTC and polar motion=0 (Earth-fixed approximation).'};

export function frameAt(value,eop={}) {
  // shortcut: reduced IAU2000B is metre-level at LEO; use full SOFA/IERS rotation for sub-metre frames.
  const date=validDate(value),time=astroTime(date),rot=Astronomy.Rotation_EQD_EQJ(time).rot;
  const eqeq=Astronomy.e_tilt(time).ee*15/3600*DEG;
  const c=Math.cos(eqeq),s=Math.sin(eqeq);
  const temeToGcrs=multiply(BIAS,multiply(transpose(rot),[[c,-s,0],[s,c,0],[0,0,1]]));
  // shortcut: absent EOP means UT1=UTC and zero polar motion; supply current IERS data for precise ground coordinates.
  const xp=(eop.xpArcsec||0)/3600*DEG,yp=(eop.ypArcsec||0)/3600*DEG;
  const cx=Math.cos(xp),sx=Math.sin(xp),cy=Math.cos(yp),sy=Math.sin(yp);
  const polar=[[cx,0,sx],[sx*sy,cy,-cx*sy],[-sx*cy,sy,cx*cy]];
  return {date,time,temeToGcrs,gcrsToTeme:transpose(temeToGcrs),polar,
    gmst:gmst(date,eop.dut1Seconds||0),eopApplied:Object.hasOwn(eop,'dut1Seconds')};
}
export function temeToGcrs(v,date) { return matVec(frameAt(date).temeToGcrs,v); }
export function gcrsToTeme(v,date) { return matVec(frameAt(date).gcrsToTeme,v); }
export function temeToItrs(v,date,eop={}) { const frame=frameAt(date,eop);return matVec(frame.polar,rotateZ(v,-frame.gmst)); }
export function gcrsToItrs(v,date,eop={}) { return temeToItrs(gcrsToTeme(v,date),date,eop); }
export function itrsToGeodetic(v) {
  if(Math.hypot(v[0],v[1])<1e-8)return {latitude:Math.sign(v[2])*90,longitude:0,altitudeKm:Math.abs(v[2])-6356.7523142};
  const geo=eciToGeodetic(object(v),0);return {latitude:geo.latitude/DEG,longitude:geo.longitude/DEG,altitudeKm:geo.height};
}
export function observerVector(observer) {
  validateObserver(observer);
  return array(geodeticToEcf({latitude:observer.lat*DEG,longitude:observer.lon*DEG,height:observer.height||0}));
}
export function validateObserver(observer) {
  if (!observer || !Number.isFinite(observer.lat)||Math.abs(observer.lat)>90 || !Number.isFinite(observer.lon)||Math.abs(observer.lon)>180 || !Number.isFinite(observer.height??0) || Math.abs(observer.height??0)>100) throw new RangeError('Observer needs latitude ±90°, longitude ±180°, and height in km');
  return observer;
}

export function orbitRegime({semiMajorAxisKm,eccentricity,inclination,apogeeKm,perigeeKm,periodMinutes}) {
  if (eccentricity>.5 && perigeeKm<2500 && apogeeKm>30000 && apogeeKm<45000) return 'GTO';
  if (Math.abs(periodMinutes-1436.068)<30 && eccentricity<.1 && inclination<20) return 'GEO';
  if (eccentricity>.25) return 'HEO';
  if (apogeeKm<2000) return 'LEO';
  if (semiMajorAxisKm<R_EARTH+35786) return 'MEO';
  return 'HEO';
}

export function elementsFromState(position,velocity,mu=MU,radius=R_EARTH) {
  const result=stateElements(position,velocity,mu,radius);
  if(!result)return null;
  return {...result,regime:orbitRegime(result)};
}

export function validateGP(row) {
  const numeric=['NORAD_CAT_ID','MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
  for (const key of numeric) if (row[key]==null || String(row[key]).trim()==='' || !Number.isFinite(Number(row[key]))) throw new Error(`Invalid GP ${key}`);
  if (!Number.isInteger(Number(row.NORAD_CAT_ID))||Number(row.NORAD_CAT_ID)<=0 || Number(row.MEAN_MOTION)<=0 || Number(row.ECCENTRICITY)<0 || Number(row.ECCENTRICITY)>=1 || Number(row.INCLINATION)<0 || Number(row.INCLINATION)>180) throw new Error('GP elements outside allowed range');
  if (typeof row.EPOCH!=='string' || !/^\d{4}-\d\d-\d\dT/.test(row.EPOCH)) throw new Error('Invalid GP epoch');
  validDate(row.EPOCH.endsWith('Z') ? row.EPOCH : `${row.EPOCH}Z`);
  for (const [key,expected] of [['REF_FRAME','TEME'],['TIME_SYSTEM','UTC'],['MEAN_ELEMENT_THEORY','SGP4'],['CENTER_NAME','EARTH']]) if (row[key]&&row[key]!==expected) throw new Error(`Unsupported ${key}: ${row[key]}`);
  return row;
}

export class SatelliteCatalog {
  constructor(snapshot,satcat={objects:[]}) {
    const rows=Array.isArray(snapshot)?snapshot:snapshot.objects;
    if (!Array.isArray(rows)||!rows.length) throw new Error('Satellite snapshot is empty or unavailable');
    const cats=new Map((satcat.objects||[]).map(row=>[Number(row.NORAD_CAT_ID),row]));
    const ids=new Set();
    this.snapshot=Array.isArray(snapshot)?{coverage:'unspecified'}:snapshot;
    this.rows=rows.map(row=>validateGP(row));
    this.satrecs=this.rows.map(row=>json2satrec(row));
    this.objects=this.rows.map((row,i)=>{
      const norad=Number(row.NORAD_CAT_ID);if(ids.has(norad)) throw new Error(`Duplicate NORAD ${norad}`);ids.add(norad);
      const cat=cats.get(norad)||{},a=this.satrecs[i].a*R_EARTH,e=Number(row.ECCENTRICITY);
      const mean={semiMajorAxisKm:a,eccentricity:e,inclination:Number(row.INCLINATION),raan:Number(row.RA_OF_ASC_NODE),
        argumentOfPerigee:Number(row.ARG_OF_PERICENTER),meanAnomaly:Number(row.MEAN_ANOMALY),
        meanMotion:Number(row.MEAN_MOTION),meanMotionDot:Number(row.MEAN_MOTION_DOT),meanMotionDdot:Number(row.MEAN_MOTION_DDOT),bstar:Number(row.BSTAR),
        periodMinutes:2*Math.PI/this.satrecs[i].no,apogeeKm:a*(1+e)-R_EARTH,perigeeKm:a*(1-e)-R_EARTH};
      return {id:`sat:${norad}`,norad,name:String(row.OBJECT_NAME||cat.OBJECT_NAME||`NORAD ${norad}`),internationalDesignator:row.OBJECT_ID||cat.OBJECT_ID||null,
        epoch:row.EPOCH.endsWith('Z')?row.EPOCH:`${row.EPOCH}Z`,owner:cat.OWNER||'Unknown',objectType:cat.OBJECT_TYPE||'UNK',
        inclination:mean.inclination,
        launchDate:cat.LAUNCH_DATE||null,decayDate:cat.DECAY_DATE||null,rcs:cat.RCS==null||cat.RCS===''?null:Number(cat.RCS),
        constellation:row.CONSTELLATION||constellationName(String(row.OBJECT_NAME||'')),
        constellationApproximate:row.constellationApproximate??!Array.isArray(row.CONSTELLATION_GROUPS),
        constellationGroups:row.CONSTELLATION_GROUPS||[],constellationMethod:row.constellationMethod||'name heuristic only; CelesTrak membership unverified',
        regime:orbitRegime(mean),mean,index:i};
    });
  }
  index(id) { const index=this.objects.findIndex(row=>row.id===id||String(row.norad)===String(id));if(index<0) throw new Error('Satellite not found');return index; }
  state(index,value) {
    const decay=this.objects[index].decayDate;
    if(decay&&validDate(value).valueOf()>=Date.parse(decay))return null;
    const rec=this.satrecs[index],minutes=(julianDate(value)-rec.jdsatepoch)*1440;
    const state=sgp4(rec,minutes);
    if (!state || rec.error || checkForDecay(rec)) return null;
    if (![...array(state.position),...array(state.velocity)].every(Number.isFinite)) return null;
    return {position:array(state.position),velocity:array(state.velocity)};
  }
  update(value,observer,eop={}) {
    const start=performance.now(),date=validDate(value),frame=frameAt(date,eop),count=this.objects.length;
    const positions=new Float64Array(count*3),velocities=new Float64Array(count*3),temePositions=new Float64Array(count*3),temeVelocities=new Float64Array(count*3),geodetic=new Float64Array(count*3);
    const valid=new Uint8Array(count),visible=new Uint8Array(count),sunlit=new Uint8Array(count);
    const earth=bodiesAt(date).find(body=>body.id==='earth'),sun=earth.position.map(x=>-x/AU_KM);
    const observerEcf=observer?observerVector(observer):null;
    const sunItrs=rotateZ(matVec(frame.gcrsToTeme,sun),-frame.gmst);
    const observerDark=observerEcf ? dot(observerEcf,sunItrs)<0 : false;
    for(let i=0;i<count;i++) {
      const state=this.state(i,date);if(!state) continue;
      const p=matVec(frame.temeToGcrs,state.position),v=matVec(frame.temeToGcrs,state.velocity);
      positions.set(p,i*3);velocities.set(v,i*3);temePositions.set(state.position,i*3);temeVelocities.set(state.velocity,i*3);valid[i]=1;
      const itrs=matVec(frame.polar,rotateZ(state.position,-frame.gmst)),geo=itrsToGeodetic(itrs);
      geodetic.set([geo.latitude,geo.longitude,geo.altitudeKm],i*3);
      sunlit[i]=shadowFraction(object(sun),object(p))<1?1:0;
      if(observer) {const look=lookAngles(state.position,state.velocity,date,observer,eop,frame);visible[i]=look.elevation>0&&sunlit[i]&&observerDark?1:0;}
    }
    return {type:'positions',utc:date.toISOString(),frame:SATELLITE_SCIENCE.frame,positions,gcrsPositions:positions,velocities,
      temePositions,temeVelocities,geodetic,valid,visible,sunlit,propagationMs:performance.now()-start,eopApplied:frame.eopApplied};
  }
  details({id,date=new Date(),observer,windowOrbits=1,eop={}}) {
    if(!Number.isFinite(Number(windowOrbits))||windowOrbits<.1||windowOrbits>4)throw new RangeError('Ground-track window must be 0.1–4 orbits');
    const index=this.index(id),meta=this.objects[index],at=validDate(date),state=this.state(index,at);
    if(!state) return {...meta,utc:at.toISOString(),decayed:true,error:'SGP4 propagation failed or object decayed'};
    const frame=frameAt(at,eop),gcrs=matVec(frame.temeToGcrs,state.position),itrs=matVec(frame.polar,rotateZ(state.position,-frame.gmst));
    const geo=itrsToGeodetic(itrs),earth=bodiesAt(at).find(b=>b.id==='earth'),sun=earth.position.map(x=>-x/AU_KM);
    const shadow=shadowFraction(object(sun),object(gcrs)),ecfVelocity=rotateZ(sub(state.velocity,cross([0,0,OMEGA],state.position)),-frame.gmst);
    const ageDays=(at-Date.parse(meta.epoch))/86400000,period=meta.mean.periodMinutes*60000;
    const radialRate=dot(ecfVelocity,itrs)/norm(itrs),tangentVelocity=ecfVelocity.map((x,i)=>x-radialRate*itrs[i]/norm(itrs));
    const trajectory=[];
    const span=Number(windowOrbits)*period;
    for(let i=0;i<=160;i++) {
      const time=new Date(at.valueOf()+(i/160-.5)*2*span),sample=this.state(index,time);if(!sample) continue;
      const sampleFrame=frameAt(time,eop),p=matVec(sampleFrame.temeToGcrs,sample.position),earthAt=bodiesAt(time).find(b=>b.id==='earth');
      const geoAt=itrsToGeodetic(matVec(sampleFrame.polar,rotateZ(sample.position,-sampleFrame.gmst)));
      trajectory.push({utc:time.toISOString(),position:p,latitude:geoAt.latitude,longitude:geoAt.longitude,altitudeKm:geoAt.altitudeKm,
        sunlit:shadowFraction(object(earthAt.position.map(x=>-x/AU_KM)),object(p))<1});
    }
    const look=observer?lookAngles(state.position,state.velocity,at,observer,eop):null;
    if(look){const observerDark=dot(observerVector(observer),rotateZ(matVec(frame.gcrsToTeme,sun),-frame.gmst))<0;look.observerDark=observerDark;look.aboveHorizon=look.elevation>0;look.visible=look.aboveHorizon&&shadow<1&&observerDark;}
    return {...meta,utc:at.toISOString(),ageDays,stale:Math.abs(ageDays)>3,temePosition:state.position,temeVelocity:state.velocity,
      gcrsPosition:gcrs,gcrsVelocity:matVec(frame.temeToGcrs,state.velocity),itrsPosition:itrs,latitude:geo.latitude,longitude:geo.longitude,
      altitudeKm:geo.altitudeKm,speedKmS:norm(state.velocity),groundSpeedKmS:norm(tangentVelocity)*R_EARTH/norm(state.position),
      osculating:elementsFromState(state.position,state.velocity),illumination:shadow>=1?'umbra':shadow<=0?'sunlit':'penumbra',shadowFraction:shadow,
      look,trajectory,frame:SATELLITE_SCIENCE.frame,snapshot:{fetched_at:this.snapshot.fetched_at,source:this.snapshot.source,citation:this.snapshot.citation},
      magnitude:null,magnitudeNote:'Not estimated: size, attitude, reflectance and calibrated photometry are unavailable.'};
  }
  passes({id,date=new Date(),observer,hours=48,minElevation=0,eop={}}) {
    if(!Number.isFinite(Number(hours))||hours<1||hours>168)throw new RangeError('Pass window must be 1–168 hours');
    validateObserver(observer);const index=this.index(id),start=validDate(date).valueOf(),end=start+Number(hours)*3600000;
    const threshold=Number(minElevation);if(!Number.isFinite(threshold)||threshold<0||threshold>90) throw new RangeError('Minimum elevation must be 0–90°');
    const elevation=(time)=>{const s=this.state(index,new Date(time));return s?lookAngles(s.position,s.velocity,new Date(time),observer,eop).elevation:-90;};
    const crossing=(a,b,rising)=>{while(b-a>250){const m=(a+b)/2;if((elevation(m)>=threshold)===rising)b=m;else a=m;}return (a+b)/2;};
    const result=[];let previous=start,prev=elevation(start),rise=prev>=threshold?start:null;
    const step=Math.min(30000,this.objects[index].mean.periodMinutes*60000/180);
    for(let time=start+step;time<=end+step;time+=step) {
      const current=Math.min(end,time),el=elevation(current);
      if(prev<threshold&&el>=threshold) rise=crossing(previous,current,true);
      if(prev>=threshold&&el<threshold&&rise!=null) {
        const set=crossing(previous,current,false);let a=rise,b=set;
        for(let n=0;n<28;n++){const p=a+(b-a)/3,q=b-(b-a)/3;if(elevation(p)<elevation(q))a=p;else b=q;}
        const peak=(a+b)/2,detail=this.state(index,new Date(peak));
        result.push({rise:new Date(rise).toISOString(),culmination:new Date(peak).toISOString(),set:new Date(set).toISOString(),maxElevation:elevation(peak),
          rangeKm:lookAngles(detail.position,detail.velocity,new Date(peak),observer,eop).rangeKm,ongoing:rise===start,magnitude:null});rise=null;
      }
      previous=current;prev=el;if(current===end)break;
    }
    return {passes:result,method:'SGP4 geometric horizon crossings; 30 s or shorter sampling, 0.25 s crossing refinement; no refraction',hours,
      stale:Math.abs((start-Date.parse(this.objects[index].epoch))/86400000)>3};
  }
  measure({a,b,date=new Date(),observer,eop={}}) {
    const at=validDate(date),frame=frameAt(at,eop);
    const get=(id)=>{
      if(id==='ground'||id==='observer'){const p=observerVector(observer);return {position:matVec(frame.temeToGcrs,rotateZ(p,frame.gmst)),velocity:matVec(frame.temeToGcrs,rotateZ(cross([0,0,OMEGA],p),frame.gmst))};}
      if(id==='moon'||String(id).startsWith('solar:')){const body=bodiesAt(at).find(body=>body.id===(id==='moon'?'moon':id.slice(6)));if(!body)throw new Error('Solar body not found');return {position:body.geocentricPosition,velocity:body.geocentricVelocity};}
      const s=this.state(this.index(id),at);if(!s)throw new Error('Object cannot be propagated');return {position:matVec(frame.temeToGcrs,s.position),velocity:matVec(frame.temeToGcrs,s.velocity)};
    };
    const first=get(a),second=get(b),delta=sub(second.position,first.position),dv=sub(second.velocity,first.velocity),distanceKm=norm(delta);
    const fixed=(p)=>matVec(frame.polar,rotateZ(matVec(frame.gcrsToTeme,p),-frame.gmst)).map((x,i)=>x/(i===2?6356.7523142:6378.137));
    const firstScaled=fixed(first.position),scaledDelta=sub(fixed(second.position),firstScaled);
    const t=dot(scaledDelta,scaledDelta)?Math.max(0,Math.min(1,-dot(firstScaled,scaledDelta)/dot(scaledDelta,scaledDelta))):0;
    return {utc:at.toISOString(),distanceKm,relativeSpeedKmS:norm(dv),rangeRateKmS:distanceKm?dot(delta,dv)/distanceKm:0,
      lineOfSight:norm(firstScaled.map((x,i)=>x+t*scaledDelta[i]))>=1-1e-8?'clear':'blocked by Earth',earthModel:'WGS84 reference ellipsoid'};
  }
  async closeApproaches({id,date=new Date(),hours=24,distanceKm=10,onProgress=()=>{}}) {
    if(!Number.isFinite(Number(hours))||hours<1||hours>72)throw new RangeError('Screening window must be 1–72 hours');
    const index=this.index(id),start=validDate(date).valueOf(),duration=Number(hours)*3600000,threshold=Number(distanceKm);
    if(!Number.isFinite(threshold)||threshold<=0||threshold>10000)throw new RangeError('Screening distance must be 0–10000 km');
    const best=new Map(),step=60000;
    for(let offset=0;offset<=duration;offset+=step) {
      const at=new Date(start+offset),target=this.state(index,at);if(!target)continue;
      for(let i=0;i<this.objects.length;i++) {
        if(i===index)continue;const s=this.state(i,at);if(!s)continue;
        const r=sub(s.position,target.position),v=sub(s.velocity,target.velocity),v2=dot(v,v),dt=v2?Math.max(-30,Math.min(30,-dot(r,v)/v2)):0;
        if(norm(r.map((x,k)=>x+v[k]*dt))>threshold+10)continue;
        let a=Math.max(start,at.valueOf()+dt*1000-30000),b=Math.min(start+duration,at.valueOf()+dt*1000+30000);
        const separation=(time)=>{const p=this.state(index,new Date(time)),q=this.state(i,new Date(time));return p&&q?norm(sub(p.position,q.position)):Infinity;};
        for(let n=0;n<20;n++){const p=a+(b-a)/3,q=b-(b-a)/3;if(separation(p)<separation(q))b=q;else a=p;}
        const time=(a+b)/2,distance=separation(time),prior=best.get(i);
        if(distance<=threshold&&(!prior||distance<prior.distanceKm))best.set(i,{id:this.objects[i].id,norad:this.objects[i].norad,name:this.objects[i].name,utc:new Date(time).toISOString(),distanceKm:distance});
      }
      if(offset%300000===0){onProgress(offset/duration);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    return {encounters:[...best.values()].sort((a,b)=>a.distanceKm-b.distanceKm),method:'60 s sampling with linear screening and SGP4 local minimization',
      caveat:'Screening estimate from public GP data, not an official conjunction assessment. Sampling may miss encounters; no covariance or collision probability.',hours,distanceKm:threshold};
  }
  statistics() {
    const counts=(key)=>this.objects.reduce((out,row)=>{const value=row[key]||'Unknown';out[value]=(out[value]||0)+1;return out;},{});
    return {total:this.objects.length,regime:counts('regime'),type:counts('objectType'),owner:counts('owner'),
      launches:this.objects.reduce((out,row)=>{const year=row.launchDate?.slice(0,4)||'Unknown';out[year]=(out[year]||0)+1;return out;},{})};
  }
}

function constellationName(name) {
  for(const [prefix,title] of [['STARLINK','Starlink'],['ONEWEB','OneWeb'],['NAVSTAR','GPS'],['GPS','GPS'],['GSAT','Galileo'],['GALILEO','Galileo'],['COSMOS',''],['BEIDOU','BeiDou'],['IRIDIUM','Iridium']]) if(name.toUpperCase().startsWith(prefix)) return title||'Unknown';
  return 'Unknown';
}

export function lookAngles(position,velocity,value,observer,eop={},cachedFrame) {
  const frame=cachedFrame||frameAt(value,eop),site=observerVector(observer),itrs=matVec(frame.polar,rotateZ(position,-frame.gmst));
  const relative=sub(itrs,site),fixedVelocity=matVec(frame.polar,rotateZ(sub(velocity,cross([0,0,OMEGA],position)),-frame.gmst));
  const look=ecfToLookAngles({latitude:observer.lat*DEG,longitude:observer.lon*DEG,height:observer.height||0},object(itrs));
  const rangeKm=norm(relative),rangeRateKmS=dot(relative,fixedVelocity)/rangeKm;
  return {azimuth:look.azimuth/DEG,elevation:look.elevation/DEG,rangeKm,rangeRateKmS,dopplerFactor:1-rangeRateKmS/299792.458,
    dopplerNote:'Multiply chosen transmitted frequency by dopplerFactor; first-order nonrelativistic Doppler.'};
}

export function createSatelliteClient() {
  const worker=new Worker(new URL('../data/satellite-worker.js',import.meta.url),{type:'module'}),listeners=new Set(),pending=new Map();let nextId=0;
  worker.onmessage=({data})=>{
    if(data.requestId!=null){const callback=pending.get(data.requestId);pending.delete(data.requestId);if(callback)data.error?callback.reject(new Error(data.error)):callback.resolve(data.result);}
    else for(const listener of listeners)listener(data);
  };
  worker.onerror=(error)=>{for(const {reject} of pending.values())reject(new Error(error.message||'Satellite worker failed'));pending.clear();for(const listener of listeners)listener({type:'error',error:error.message||'Satellite worker failed'});};
  const request=(method,args={})=>new Promise((resolve,reject)=>{const requestId=++nextId;pending.set(requestId,{resolve,reject});worker.postMessage({method,args,requestId});});
  return {load:(url='data/satellites/gp.json')=>request('load',{url}),update:(date,observer)=>worker.postMessage({method:'update',args:{date:validDate(date).toISOString(),observer}}),
    subscribe:(fn)=>{listeners.add(fn);return()=>listeners.delete(fn);},request,dispose:()=>{worker.terminate();for(const {reject} of pending.values())reject(new Error('Satellite client disposed'));pending.clear();listeners.clear();}};
}

export {json2satrec,twoline2satrec,sgp4};
