import * as Astronomy from '../vendor/astronomy.js';
import {timeScales,validDate} from './time.js';
import {stateElements} from './orbits.js';

export const AU_KM = 149597870.7;
export const EPHEMERIS = {name:'Astronomy Engine',version:'2.1.19',license:'MIT',accuracy:'about 1 arcminute',
  source:'https://github.com/cosinekitty/astronomy/tree/v2.1.19',frame:'ICRS-aligned J2000 mean equator (EQJ)',
  physicalSource:'https://ssd.jpl.nasa.gov/planets/phys_par.html',massSource:'https://ssd.jpl.nasa.gov/astro_par.html',
  rotationSource:'https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf'};
export const ECLIPTIC_OBLIQUITY = 23.439291111*Math.PI/180;
export const OORT_CLOUD = Object.freeze({innerAU:[2000,5000],outerAU:[10000,100000],displayShellsAU:[5000,100000],
  source:'https://science.nasa.gov/solar-system/oort-cloud/facts/',
  note:'Schematic statistical extent, not tracked objects. The Oort Cloud has not been directly observed; its boundaries are uncertain.'});
export const SATURN_RINGS = Object.freeze({bands:[{innerKm:74491,outerKm:91975,opacity:.28},{innerKm:91975,outerKm:117570,opacity:.85},{innerKm:122050,outerKm:136770,opacity:.65}],
  source:'https://pds-rings.seti.org/saturn/saturn_rings_table.html',note:'Schematic C, B and A rings at measured radial extents; ring structure and optical appearance are simplified.'});
const COLORS = {sun:'#fff4dd',mercury:'#a9a29a',venus:'#e3d4ad',earth:'#89abd3',moon:'#b7b4af',mars:'#bd7861',jupiter:'#c6ad91',saturn:'#d3c295',uranus:'#a5d9df',neptune:'#7398c7',pluto:'#b8aaa0',io:'#d9ca89',europa:'#d1c6b0',ganymede:'#a49c8c',callisto:'#817e78'};
const SURFACES = {
  moon:{file:'data/textures/moon.jpg',source:'https://svs.gsfc.nasa.gov/4720/',note:'NASA LRO visualization map (2025): natural-color approximation with adjusted exposure/white balance, small dropouts inpainted and polar gaps filled from laser albedo. Not for surface measurements.'},
  mercury:{file:'data/textures/mercury.jpg',source:'https://science.nasa.gov/photojournal/full-global-mercury-mosaic/',note:'Historical 2009 monochrome MESSENGER/Mariner 10 mosaic, 97.7% coverage. No-data gaps and seams retained. Longitude registration is illustrative.'},
  mars:{file:'data/textures/mars.jpg',source:'https://space.jpl.nasa.gov/tmaps/mars.html',note:'Historical Viking mosaic, NASA/JPL/USGS. Processed for illustration; not suitable for surface measurements.'},
  jupiter:{file:'data/textures/jupiter.jpg',source:'https://science.nasa.gov/asset/hubble/jupiter-global-map-2019/',note:'NASA/ESA Hubble cloud mosaic from 2019; missing polar coverage shown black. Cloud features and longitude registration are illustrative, not current weather.'},
};
// Mean radii (km), JPL physical parameters; the Sun uses IAU's nominal photospheric radius.
const BODY_DATA = [
  ['Sun',695700,0],['Mercury',2439.4,87.969],['Venus',6051.8,224.701],['Earth',6371.0084,365.256],
  ['Moon',1737.4,27.322],['Mars',3389.5,686.980],['Jupiter',69911,4332.589],
  ['Saturn',58232,10759.22],['Uranus',25362,30685.4],['Neptune',24622,60189],['Pluto',1188.3,90560],
];
const toArray = (v) => [v.x,v.y,v.z];
const scale = (v,k) => v.map(x=>x*k);
const add = (a,b) => a.map((x,i)=>x+b[i]);
const subtract = (a,b) => a.map((x,i)=>x-b[i]);
const ecliptic = ([x,y,z]) => [x,.9174821430670688*y+.3977769691083922*z,-.3977769691083922*y+.9174821430670688*z];
export const eclipticToEquatorial = ([x,y,z]) => [x,Math.cos(ECLIPTIC_OBLIQUITY)*y-Math.sin(ECLIPTIC_OBLIQUITY)*z,Math.sin(ECLIPTIC_OBLIQUITY)*y+Math.cos(ECLIPTIC_OBLIQUITY)*z];
/** View direction specified in the actual J2000 ecliptic, converted to renderer angles. */
export function eclipticView(longitude=45,latitude=55) {
  const lon=longitude*Math.PI/180,lat=latitude*Math.PI/180,vector=eclipticToEquatorial([Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)]);
  return {yaw:Math.atan2(vector[1],vector[0]),pitch:Math.asin(vector[2])};
}
export function bodyRotation(name,value) {
  const axis=Astronomy.RotationAxis(name,astroTime(value));
  return {north:toArray(axis.north),ra:axis.ra*15,dec:axis.dec,spin:((axis.spin%360)+360)%360,frame:EPHEMERIS.frame,source:EPHEMERIS.rotationSource};
}

export function astroTime(value) {
  const date = validDate(value), time = new Astronomy.AstroTime(date);
  if (date.getUTCFullYear() >= 1972) time.tt = timeScales(date).jdTT-2451545;
  return time;
}

export function bodiesAt(value = new Date()) {
  // TODO: add verified ephemerides for other major moons; this library supplies Earth's Moon and four Galilean moons.
  const time = astroTime(value), earth = Astronomy.HelioState('Earth',time);
  const earthPosition = scale(toArray(earth),AU_KM);
  const earthVelocity = scale([earth.vx,earth.vy,earth.vz],AU_KM/86400);
  const bodies = BODY_DATA.map(([name,radiusKm,periodDays]) => {
    const state = Astronomy.HelioState(name,time);
    const position = scale(toArray(state),AU_KM), velocity = scale([state.vx,state.vy,state.vz],AU_KM/86400);
    return {...bodyRecord(name,position,velocity,radiusKm,periodDays,earthPosition,earthVelocity),rotation:bodyRotation(name,value)};
  });
  const jupiter = bodies.find(body=>body.name==='Jupiter'), moons = Astronomy.JupiterMoons(time);
  for (const [name,radiusKm,periodDays] of [['Io',1821.6,1.769],['Europa',1560.8,3.551],['Ganymede',2634.1,7.155],['Callisto',2410.3,16.689]]) {
    const state = moons[name.toLowerCase()];
    const relativePosition=scale(toArray(state),AU_KM),relativeVelocity=scale([state.vx,state.vy,state.vz],AU_KM/86400);
    bodies.push({...bodyRecord(name,add(jupiter.position,relativePosition),add(jupiter.velocity,relativeVelocity),radiusKm,periodDays,earthPosition,earthVelocity),
      parent:'jupiter',elements:{...stateElements(ecliptic(relativePosition),ecliptic(relativeVelocity),126686534),frame:'Jupiter-centred ecliptic J2000'}});
  }
  return bodies;
}

function bodyRecord(name,position,velocity,radiusKm,periodDays,earthPosition,earthVelocity) {
  const geocentricPosition = subtract(position,earthPosition), geocentricVelocity = subtract(velocity,earthVelocity);
  const geocentricDistanceKm = Math.hypot(...geocentricPosition), distanceKm = Math.hypot(...position);
  const moon=name==='Moon',elements=name==='Sun'?null:stateElements(ecliptic(moon?geocentricPosition:position),ecliptic(moon?geocentricVelocity:velocity),moon?398600.435507:132712440041.279419);
  return {id:name.toLowerCase(),name,position,velocity,radiusKm,periodDays,geocentricPosition,geocentricVelocity,color:COLORS[name.toLowerCase()],
    texture:SURFACES[name.toLowerCase()]||null,
    appearanceNote:SURFACES[name.toLowerCase()]?.note||(name==='Sun'?'Procedural visible-light photosphere with approximate limb darkening; illustrative granulation, not current solar imagery.':'Mean-color surface illustration; no verified surface texture is bundled for this body.'),
    appearanceSource:SURFACES[name.toLowerCase()]?.source||(name==='Sun'?'https://solarscience.msfc.nasa.gov/surface.shtml':EPHEMERIS.physicalSource),
    parent:moon?'earth':'sun',elements:elements?{...elements,frame:moon?'Geocentric ecliptic J2000':'Heliocentric ecliptic J2000'}:null,
    distanceKm,heliocentricDistanceKm:distanceKm,geocentricDistanceKm,speedKmS:Math.hypot(...velocity),
    lightMinutes:geocentricDistanceKm/299792.458/60,
    ra:(Math.atan2(geocentricPosition[1],geocentricPosition[0])*180/Math.PI+360)%360,
    dec:geocentricDistanceKm ? Math.asin(geocentricPosition[2]/geocentricDistanceKm)*180/Math.PI : 0,
    frame:EPHEMERIS.frame,ephemeris:EPHEMERIS.name,accuracy:EPHEMERIS.accuracy,
    coordinateNote:'Geometric positions at the selected UTC time; RA/Dec exclude light time and aberration.'};
}

export function bodyRiseSet(name,value,observer) {
  if (name==='Earth'||!BODY_DATA.some(([body])=>body===name)) return null;
  const site = new Astronomy.Observer(observer.lat,observer.lon,(observer.height||0)*1000);
  const time = astroTime(value);
  return {rise:Astronomy.SearchRiseSet(name,site,+1,time,2)?.date.toISOString() ?? null,
    set:Astronomy.SearchRiseSet(name,site,-1,time,2)?.date.toISOString() ?? null};
}

export function solarOrbit(name,value,samples=160) {
  const meta = BODY_DATA.find(([body])=>body.toLowerCase()===name.toLowerCase());
  if (!meta || !meta[2]) return [];
  const start = validDate(value).valueOf();
  return Array.from({length:samples+1},(_,i)=>{
    const time=astroTime(new Date(start+(i/samples-.5)*meta[2]*86400000));
    return scale(toArray(Astronomy.HelioState(meta[0],time)),AU_KM);
  });
}

export {Astronomy};
