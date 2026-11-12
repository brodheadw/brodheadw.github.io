const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(x)=>Math.max(-1,Math.min(1,x));
const degrees=(x)=>(x*180/Math.PI+360)%360;

export function stateElements(position,velocity,mu,radius=0) {
  const r=Math.hypot(...position),v=Math.hypot(...velocity),h=cross(position,velocity),hn=Math.hypot(...h),n=[-h[1],h[0],0],nn=Math.hypot(...n);
  if(!r||!hn||!(mu>0))return null;
  const evec=cross(velocity,h).map((x,i)=>x/mu-position[i]/r),e=Math.hypot(...evec),a=1/(2/r-v*v/mu);
  let trueAnomaly;
  if(e>1e-10){trueAnomaly=Math.acos(clamp(dot(evec,position)/(e*r)));if(dot(position,velocity)<0)trueAnomaly=2*Math.PI-trueAnomaly;}
  else if(nn>1e-10){trueAnomaly=Math.acos(clamp(dot(n,position)/(nn*r)));if(position[2]<0)trueAnomaly=2*Math.PI-trueAnomaly;}
  else trueAnomaly=Math.atan2(position[1],position[0])*Math.sign(h[2]);
  let argument=0;
  if(e>1e-10&&nn>1e-10){argument=Math.acos(clamp(dot(n,evec)/(nn*e)));if(evec[2]<0)argument=2*Math.PI-argument;}
  else if(e>1e-10)argument=Math.atan2(evec[1],evec[0])*Math.sign(h[2]);
  const eccentricAnomaly=e<1?2*Math.atan2(Math.sqrt(1-e)*Math.sin(trueAnomaly/2),Math.sqrt(1+e)*Math.cos(trueAnomaly/2)):NaN;
  return {semiMajorAxisKm:a,eccentricity:e,inclination:Math.acos(clamp(h[2]/hn))*180/Math.PI,
    raan:nn>1e-10?degrees(Math.atan2(n[1],n[0])):0,argumentOfPerigee:degrees(argument),trueAnomaly:degrees(trueAnomaly),
    meanAnomaly:Number.isFinite(eccentricAnomaly)?degrees(eccentricAnomaly-e*Math.sin(eccentricAnomaly)):null,
    periodMinutes:a>0?2*Math.PI*Math.sqrt(a*a*a/mu)/60:null,apogeeKm:a*(1+e)-radius,perigeeKm:a*(1-e)-radius,
    angularConvention:'Angles in degrees; RAAN=0 for equatorial orbits; argument of perigee=0 for circular orbits.'};
}
