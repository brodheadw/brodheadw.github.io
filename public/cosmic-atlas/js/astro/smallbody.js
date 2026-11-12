import {validDate,julianDate} from './time.js';
import {bodiesAt} from './solar.js';
import {stateElements} from './orbits.js';

let table=null;
const norm=v=>Math.hypot(...v);
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const ecliptic=([x,y,z])=>[x,.9174821430670688*y+.3977769691083922*z,-.3977769691083922*y+.9174821430670688*z];

export function setSmallBodyData(data){
  if(data?.schema!==1||data.frame!=='Heliocentric ICRF equatorial'||data.time_system!=='UTC'||!Array.isArray(data.objects)||!data.objects.length)throw new Error('Unsupported small-body snapshot');
  const start=validDate(data.coverage_start).valueOf(),end=validDate(data.coverage_end).valueOf();
  if(end<=start||new Set(data.objects.map(b=>b.id)).size!==data.objects.length)throw new Error('Invalid small-body coverage or IDs');
  for(const body of data.objects){
    if(!body.id?.startsWith('small:')||!body.name||!Array.isArray(body.samples)||body.samples.length<2||(body.radiusKm!=null&&(!Number.isFinite(body.radiusKm)||body.radiusKm<=0)))throw new Error('Invalid small-body record');
    for(let i=0;i<body.samples.length;i++){
      const row=body.samples[i];
      if(row.length!==7||!row.every(Number.isFinite)||(i&&row[0]<=body.samples[i-1][0]))throw new Error('Invalid small-body vector samples');
    }
    if(Math.abs(body.samples[0][0]-julianDate(start))>1e-8||Math.abs(body.samples.at(-1)[0]-julianDate(end))>1e-8)throw new Error('Small-body coverage does not match its samples');
  }
  table=data;
  return smallBodyCoverage();
}

export async function loadSmallBodies(url='data/smallbodies/ephemerides.json'){
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Small-body snapshot HTTP ${response.status}`);
  return setSmallBodyData(await response.json());
}

export function smallBodyCoverage(){
  return table?{loaded:true,start:table.coverage_start,end:table.coverage_end,count:table.objects.length,source:table.provider,fetched_at:table.fetched_at,published_at:table.published_at,orbitSolutions:Object.fromEntries(table.objects.map(body=>[body.id,{spkid:body.spkid,solution:body.orbitSolution,date:body.orbitSolutionDate}])),caveat:table.caveat}:{loaded:false,start:null,end:null,count:0};
}

export function interpolateSmallBody(samples,jd){
  if(jd<samples[0][0]||jd>samples.at(-1)[0])return null;
  let low=0,high=samples.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(samples[mid][0]>jd)high=mid;else low=mid;}
  low=Math.min(low,samples.length-2);
  const a=samples[low],b=samples[low+1],dt=(b[0]-a[0])*86400,t=(jd-a[0])/(b[0]-a[0]),t2=t*t,t3=t2*t;
  const position=[],velocity=[];
  for(let k=1;k<=3;k++){
    position.push((2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*dt*a[k+3]+(-2*t3+3*t2)*b[k]+(t3-t2)*dt*b[k+3]);
    velocity.push(((6*t2-6*t)*a[k]+(3*t2-4*t+1)*dt*a[k+3]+(-6*t2+6*t)*b[k]+(3*t2-2*t)*dt*b[k+3])/dt);
  }
  return {position,velocity};
}

function record(body,jd,earth){
  const state=interpolateSmallBody(body.samples,jd);
  if(!state)return null;
  const {position,velocity}=state,geocentricPosition=subtract(position,earth.position),geocentricVelocity=subtract(velocity,earth.velocity);
  const distanceKm=norm(position),geocentricDistanceKm=norm(geocentricPosition);
  return {id:body.id,name:body.name,kind:body.kind,parent:'sun',radiusKm:body.radiusKm??null,radiusSource:body.radiusSource??null,
    position,velocity,geocentricPosition,geocentricVelocity,distanceKm,heliocentricDistanceKm:distanceKm,geocentricDistanceKm,speedKmS:norm(velocity),
    lightMinutes:geocentricDistanceKm/299792.458/60,ra:(Math.atan2(geocentricPosition[1],geocentricPosition[0])*180/Math.PI+360)%360,
    dec:geocentricDistanceKm?Math.asin(geocentricPosition[2]/geocentricDistanceKm)*180/Math.PI:0,
    elements:{...stateElements(ecliptic(position),ecliptic(velocity),132712440041.279419),frame:'Heliocentric ecliptic J2000'},
    frame:table.frame,ephemeris:'NASA/JPL Horizons sampled vectors',source:body.source,sbdbSource:body.sbdbSource,spkid:body.spkid,
    orbitSolution:body.orbitSolution,orbitSolutionDate:body.orbitSolutionDate,orbitClass:body.orbitClass,coverage:smallBodyCoverage(),
    validationMaxKm:body.validationMaxKm,accuracy:'Interpolation checked at three off-grid dates; physical orbit uncertainty is separate.',
    coordinateNote:'Geometric heliocentric ICRF vectors; RA/Dec exclude light time and aberration. No extrapolation beyond the sampled coverage.'};
}

export function smallBodiesAt(value=new Date(),{earthPosition,earthVelocity}={}){
  const date=validDate(value),jd=julianDate(date);
  if(!table||jd<table.objects[0].samples[0][0]||jd>table.objects[0].samples.at(-1)[0])return [];
  const earth=earthPosition&&earthVelocity?{position:earthPosition,velocity:earthVelocity}:bodiesAt(date).find(b=>b.id==='earth');
  return table.objects.map(body=>record(body,jd,earth)).filter(Boolean);
}

export function smallBodyState(id,value,options={}){return smallBodiesAt(value,options).find(body=>body.id===id)||null;}

export function smallBodyOrbit(id,value,{days=365,samples=160}={}){
  const body=table?.objects.find(body=>body.id===id);if(!body)return [];
  if(!Number.isFinite(days)||days<=0||!Number.isInteger(samples)||samples<2||samples>2000)throw new RangeError('Invalid small-body path window');
  const center=validDate(value).valueOf(),coverageStart=Date.parse(table.coverage_start),coverageEnd=Date.parse(table.coverage_end);
  if(center<coverageStart||center>coverageEnd)return [];
  const start=Math.max(center-days*43200000,coverageStart),end=Math.min(center+days*43200000,coverageEnd);
  if(start>end)return [];
  return Array.from({length:samples+1},(_,i)=>interpolateSmallBody(body.samples,julianDate(start+(end-start)*i/samples))?.position).filter(Boolean);
}
