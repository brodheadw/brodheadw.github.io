import {esc,$,rows,utc,downloadFile} from '../shell/helpers.js';
import {palette} from '../palette.js';
import {SATELLITE_SCIENCE} from '../astro/satellites.js';

const mounted=new WeakMap();
const format=(value,digits=3)=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:digits}):'Unavailable';
const vector=(value,digits=3)=>Array.isArray(value)?value.map(x=>format(x,digits)).join(', '):'Unavailable';
const objectType=(code)=>({PAY:'Payload','R/B':'Rocket body',DEB:'Debris',UNK:'Unknown'}[code]||code||'Unknown');

export function groundTrackSVG(trajectory=[],detail={}) {
  const points=trajectory.filter(row=>Number.isFinite(row.longitude)&&Number.isFinite(row.latitude));
  const xy=(row)=>[10+(row.longitude+180)/360*280,10+(90-row.latitude)/180*130];
  const lines=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(Math.abs(a.longitude-b.longitude)>180)continue;
    const [x1,y1]=xy(a),[x2,y2]=xy(b),past=Date.parse(b.utc)<Date.parse(detail.utc);
    lines.push(`<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${b.sunlit?palette.neutrinos:palette.muted}" stroke-width="${past?1.3:1.8}" opacity="${past ? .55 : 1}"${b.sunlit?'':' stroke-dasharray="2 2"'}/>`);
  }
  const marker=Number.isFinite(detail.longitude)&&Number.isFinite(detail.latitude)?xy(detail):null;
  return `<svg class="plot" viewBox="0 0 300 160" role="img" aria-label="Ground track: longitude horizontal, latitude vertical; solid sunlit, dotted Earth shadow"><rect x="10" y="10" width="280" height="130" fill="${palette.bg}" stroke="${palette.edge}"/>${[-90,0,90].map(lon=>`<path d="M${10+(lon+180)/360*280} 10v130" stroke="${palette.grid}"/>`).join('')}${[-45,0,45].map(lat=>`<path d="M10 ${10+(90-lat)/180*130}h280" stroke="${palette.grid}"/>`).join('')}${lines.join('')}${marker?`<circle cx="${marker[0]}" cy="${marker[1]}" r="3" fill="${palette.target}"><title>Current sub-satellite point</title></circle>`:''}<text x="10" y="154" fill="${palette.muted}" font-size="9">180°W</text><text x="150" y="154" text-anchor="middle" fill="${palette.muted}" font-size="9">0° longitude</text><text x="290" y="154" text-anchor="end" fill="${palette.muted}" font-size="9">180°E</text></svg>`;
}

function elementRows(mean,osculating) {
  const definitions=[['Semi-major axis','semiMajorAxisKm','km',3],['Eccentricity','eccentricity','',7],['Inclination','inclination','°',4],['RAAN','raan','°',4],['Argument of perigee','argumentOfPerigee','°',4],['Mean anomaly','meanAnomaly','°',4],['True anomaly','trueAnomaly','°',4],['Period','periodMinutes','min',3],['Apogee altitude','apogeeKm','km',3],['Perigee altitude','perigeeKm','km',3]];
  return `<table class="units"><thead><tr><th scope="col">Element</th><th scope="col">GP mean</th><th scope="col">Osculating</th></tr></thead><tbody>${definitions.map(([label,key,unit,digits])=>`<tr><th scope="row">${label}</th><td>${format(mean?.[key],digits)} ${unit}</td><td>${format(osculating?.[key],digits)} ${unit}</td></tr>`).join('')}</tbody></table>`;
}

export function satelliteStateCSV(detail) {
  const flat={};
  function add(value,prefix=''){
    for(const [key,item] of Object.entries(value||{})){
      if(key==='trajectory'||key==='snapshot')continue;
      const field=prefix?`${prefix}_${key}`:key;
      if(item&&typeof item==='object'&&!Array.isArray(item))add(item,field);
      else if(Array.isArray(item))item.forEach((x,i)=>{if(typeof x!=='object')flat[`${field}_${['x','y','z'][i]||i}`]=x;});
      else flat[field]=item??'';
    }
  }
  add(detail);const quote=(value)=>`"${String(value).replaceAll('"','""')}"`;
  return Object.keys(flat).map(quote).join(',')+'\n'+Object.values(flat).map(quote).join(',')+'\n';
}

export function renderSatelliteInspector(el,app,row,detail) {
  if(!detail){el.innerHTML='<p class="empty">Satellite state is unavailable at the selected time.</p>';return()=>{};}
  let record=mounted.get(el);
  if(!record||record.id!==row.id||record.root!==el.firstElementChild){
    if(record)record.alive=false;
    el.innerHTML=`<div class="satellite-inspector"><div data-header></div><div class="actions"><button data-follow aria-pressed="false">Follow satellite</button><button data-json>Export JSON</button><button data-csv>Export CSV</button></div><div data-live></div><details><summary>Position & velocity vectors</summary><div data-vectors></div></details><details><summary>Mean & osculating orbital elements</summary><div data-elements></div></details><label>Past / future ground-track window<select data-window><option value=".25">±¼ orbit</option><option value=".5">±½ orbit</option><option value="1" selected>±1 orbit</option><option value="2">±2 orbits</option><option value="4">±4 orbits</option></select></label><div data-track></div><p class="notice">Solid: sunlit. Dotted: Earth shadow. Faint: past, bright: future. Gold circle: current sub-satellite point.</p><div data-observer></div><label>Transmitted frequency (MHz)<input data-frequency type="number" min=".001" max="1000000" step=".001" value="145.8"></label><p data-doppler class="notice"></p><div data-limits></div><details><summary>Complete computed state</summary><pre class="json-preview" data-json-preview></pre></details><p data-error class="error" role="status"></p></div>`;
    record={id:row.id,root:el.firstElementChild,alive:true,windowOrbits:1,detail,pending:false,customTrajectory:null,customAt:0};mounted.set(el,record);
    $(el,'[data-window]').onchange=()=>{record.windowOrbits=Number($(el,'[data-window]').value);record.customTrajectory=null;refreshTrajectory();};
    $(el,'[data-follow]').onclick=()=>{
      const following=app.store.getState().camera.mode==='follow';
      if(following)app.store.set({camera:{mode:'orbit'}});else app.select('satellites',row.id);
      update();
    };
    $(el,'[data-json]').onclick=()=>downloadFile(`${row.norad}-state.json`,JSON.stringify(record.detail,null,2));
    $(el,'[data-csv]').onclick=()=>downloadFile(`${row.norad}-state.csv`,satelliteStateCSV(record.detail),'text/csv');
    $(el,'[data-frequency]').oninput=()=>updateDoppler();
  }
  record.detail=detail;
  update();
  if(record.windowOrbits!==1&&Math.abs(Date.parse(detail.utc)-record.customAt)>10000)refreshTrajectory();
  return()=>{record.alive=false;if(mounted.get(el)===record)mounted.delete(el);};

  function updateDoppler(){
    const frequency=Number($(el,'[data-frequency]').value),factor=record.detail.look?.dopplerFactor,out=$(el,'[data-doppler]');
    out.textContent=Number.isFinite(frequency)&&frequency>0&&Number.isFinite(factor)?`Predicted received frequency ${format(frequency*factor,6)} MHz; shift ${format(frequency*1e6*(factor-1),1)} Hz. First-order line-of-sight Doppler.`:'Set an observer and a positive frequency for a Doppler estimate.';
  }
  async function refreshTrajectory(){
    if(record.pending||!record.alive)return;record.pending=true;const requestedWindow=record.windowOrbits;
    $(el,'[data-error]').textContent='';
    try{
      const result=await app.client.request('details',{id:row.id,date:app.currentDate().toISOString(),observer:app.store.getState().observer,windowOrbits:record.windowOrbits});
      if(!record.alive||mounted.get(el)!==record||requestedWindow!==record.windowOrbits)return;
      record.customTrajectory=result.trajectory;record.customAt=Date.parse(result.utc);update();
    }catch(error){if(record.alive)$(el,'[data-error]').textContent=error.message;}
    finally{record.pending=false;if(record.alive&&requestedWindow!==record.windowOrbits)refreshTrajectory();}
  }
  function update(){
    if(!record.alive)return;
    const d=record.detail,mean=d.mean||row.mean||{},look=d.look,decayed=d.decayed||(d.decayDate&&Date.parse(d.utc)>=Date.parse(d.decayDate));
    $(el,'[data-header]').innerHTML=`<span class="badge">PUBLIC GP · SGP4 PREDICTION</span><h3 class="inspector-title">${esc(row.name)}</h3><p class="${d.stale||decayed?'warning':'notice'}">${decayed?'Object decayed or propagation failed.':d.stale?'Element set is more than 3 days from the clock time.':'Predicted position, not live telemetry.'} Element age ${format(d.ageDays,3)} d. Manoeuvres can invalidate the prediction between updates.</p>`;
    $(el,'[data-follow]').setAttribute('aria-pressed',String(app.store.getState().camera.mode==='follow'));
    $(el,'[data-follow]').textContent=app.store.getState().camera.mode==='follow'?'Stop following':'Follow satellite';
    $(el,'[data-live]').innerHTML=rows([
      ['NORAD / designator',`${esc(row.norad)} / ${esc(row.internationalDesignator||'Unknown')}`],['Type / owner',`${esc(objectType(row.objectType))} / ${esc(row.owner||'Unknown')}`],
      ['Launch / decay',`${esc(row.launchDate||'Unknown')} / ${esc(row.decayDate||'Not recorded')}`],['Element epoch',utc(row.epoch)],['Computed at',utc(d.utc)],['Orbit regime',esc(row.regime)],
      ['Constellation',`${esc(row.constellation||'Unknown')} · ${row.constellationApproximate?'name estimate':row.constellation==='Unknown'?'outside queried groups':'verified group membership'}`],
      ['Latitude / longitude',`${format(d.latitude,5)}° / ${format(d.longitude,5)}°`],['Geodetic altitude',`${format(d.altitudeKm)} km`],['Inertial speed',`${format(d.speedKmS,5)} km/s`],
      ['Ground speed',`${format(d.groundSpeedKmS,4)} km/s (spherical subpoint approximation)`],['Illumination',`${esc(d.illumination||'Unavailable')} · ${format(d.shadowFraction*100,2)}% Sun obscured`],
    ]);
    $(el,'[data-vectors]').innerHTML=rows([['TEME position xyz',`${vector(d.temePosition)} km`],['GCRS position xyz',`${vector(d.gcrsPosition)} km`],['ITRS position xyz',`${vector(d.itrsPosition)} km`],['TEME velocity xyz',`${vector(d.temeVelocity,6)} km/s`],['GCRS velocity xyz',`${vector(d.gcrsVelocity,6)} km/s`]])+`<p class="notice">${esc(SATELLITE_SCIENCE.frame)}. Reduced IAU2000B rotation differs from Astropy by up to 1.92 m for tested vectors at 7348 km radius. Velocity rotates the axes without the tiny precession-rate derivative.</p>`;
    $(el,'[data-elements]').innerHTML=elementRows(mean,d.osculating)+rows([['Published mean motion',`${format(mean.meanMotion,8)} rev/day`],['Published mean-motion derivative',`${format(mean.meanMotionDot,10)} rev/day²`],['Published second derivative',`${format(mean.meanMotionDdot,10)} rev/day³`],['B* drag term',Number.isFinite(mean.bstar)?mean.bstar.toExponential(6):'Unavailable']])+`<p class="notice">SGP4 mean elements are not osculating Kepler elements. Regime rule: GTO e&gt;0.5 with perigee&lt;2500 km and apogee 30,000–45,000 km; GEO period within 30 min of a sidereal day, e&lt;0.1 and i&lt;20°; HEO e&gt;0.25; LEO apogee&lt;2000 km; remaining sub-GEO orbits MEO. Angular elements refer to the TEME equator.</p>`;
    const trajectory=record.windowOrbits===1?d.trajectory:record.customTrajectory;
    $(el,'[data-track]').innerHTML=trajectory?.length?groundTrackSVG(trajectory,d):'<p class="empty">Calculating the selected ground-track window…</p>';
    if(trajectory?.length)app.renderer?.setOrbitPaths([{positions:trajectory.flatMap(point=>point.position),geocentric:true,color:palette.target}]);
    $(el,'[data-observer]').innerHTML=look?rows([['Azimuth / elevation',`${format(look.azimuth,3)}° / ${format(look.elevation,3)}°`],['Slant range',`${format(look.rangeKm)} km`],['Range rate',`${format(look.rangeRateKmS,5)} km/s`],['Above horizon',look.aboveHorizon?'Yes':'No'],['Observer in darkness',look.observerDark?'Yes':'No'],['Optically visible geometry',look.visible?'Above horizon, sunlit, observer dark':'Visibility conditions not met'],['Magnitude','Not estimable from GP elements']]):'<p class="empty">Set an observer in the pass panel for look angles.</p>';
    $(el,'[data-limits]').innerHTML=`<p class="notice">${esc(SATELLITE_SCIENCE.earthFixedNote)} ${esc(SATELLITE_SCIENCE.caveat)}</p><p class="notice">Source: CelesTrak / USSF 18 SDS. ${esc(SATELLITE_SCIENCE.library)}, MIT. Snapshot fetched ${d.snapshot?.fetched_at?utc(d.snapshot.fetched_at):'date unavailable'}. <a href="https://celestrak.org/usage-policy.php" target="_blank" rel="noopener">CelesTrak policy ↗</a></p>`;
    $(el,'[data-json-preview]').textContent=JSON.stringify(d,null,2);updateDoppler();
  }
}
