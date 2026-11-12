const DAY_MS = 86400000;
// IERS Bulletin C / Leap_Second.dat, last insertion 2017-01-01.
export const LEAP_SECONDS = [
  ['1972-01-01',10],['1972-07-01',11],['1973-01-01',12],['1974-01-01',13],
  ['1975-01-01',14],['1976-01-01',15],['1977-01-01',16],['1978-01-01',17],
  ['1979-01-01',18],['1980-01-01',19],['1981-07-01',20],['1982-07-01',21],
  ['1983-07-01',22],['1985-07-01',23],['1988-01-01',24],['1990-01-01',25],
  ['1991-01-01',26],['1992-07-01',27],['1993-07-01',28],['1994-07-01',29],
  ['1996-01-01',30],['1997-07-01',31],['1999-01-01',32],['2006-01-01',33],
  ['2009-01-01',34],['2012-07-01',35],['2015-07-01',36],['2017-01-01',37],
].map(([date,offset]) => [Date.parse(`${date}T00:00:00Z`),offset]);

export function validDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new RangeError('Invalid UTC date');
  return date;
}

export function taiMinusUtc(value) {
  const ms = validDate(value).valueOf();
  if (ms < LEAP_SECONDS[0][0]) throw new RangeError('TAI conversion supports UTC dates from 1972');
  return LEAP_SECONDS.findLast(([epoch]) => ms >= epoch)[1];
}

export function utcToTai(value) {
  const leap = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2}T23:59):60(?:\.(\d{1,3}))?Z$/);
  if (leap) {
    const next = Date.parse(`${leap[1]}:59Z`) + 1000;
    const row = LEAP_SECONDS.find(([epoch]) => epoch === next);
    if (!row || row[1] <= 10) throw new RangeError('This UTC date has no leap second');
    return next + (row[1]-1)*1000 + Number((leap[2] || '').padEnd(3,'0'));
  }
  const date = validDate(value);
  return date.valueOf() + taiMinusUtc(date)*1000;
}

export function taiToUtc(taiMs) {
  if (!Number.isFinite(taiMs)) throw new RangeError('Invalid TAI time');
  for (const [epoch,offset] of LEAP_SECONDS.slice(1)) {
    const start = epoch + (offset-1)*1000;
    if (taiMs >= start && taiMs < start+1000) {
      return `${new Date(epoch-1000).toISOString().slice(0,17)}60.${String(Math.floor(taiMs-start)).padStart(3,'0')}Z`;
    }
  }
  const row = LEAP_SECONDS.findLast(([epoch,offset]) => taiMs >= epoch+offset*1000);
  if (!row) throw new RangeError('TAI conversion supports UTC dates from 1972');
  return new Date(taiMs-row[1]*1000).toISOString();
}

export function timeScales(value, dut1Seconds = 0) {
  if(typeof value==='string'&&/:60(?:\.\d{1,3})?Z$/.test(value)){
    const taiMs=utcToTai(value),ttMs=taiToTT(taiMs),offset=taiMinusUtc(value.replace(':60',':59'));
    // JavaScript Date has no inserted second; preserve it on the continuous TAI/TT axes.
    return {utc:taiToUtc(taiMs),leapSecond:true,utcMs:null,taiMs,ttMs,taiMinusUtc:offset,dut1Seconds,jdUTC:null,jdUT1:null,jdTT:ttMs/DAY_MS+2440587.5};
  }
  const date = validDate(value);
  const utcMs = date.valueOf(), taiMs = utcToTai(date), ttMs = taiToTT(taiMs);
  return {utc:date.toISOString(),leapSecond:false,utcMs,taiMs,ttMs,taiMinusUtc:taiMinusUtc(date),dut1Seconds,
    jdUTC:utcMs/DAY_MS+2440587.5,jdUT1:(utcMs+dut1Seconds*1000)/DAY_MS+2440587.5,
    jdTT:ttMs/DAY_MS+2440587.5};
}

export function taiToTT(taiMs){if(!Number.isFinite(taiMs))throw new RangeError('Invalid TAI time');return taiMs+32184;}
export function ttToTai(ttMs){if(!Number.isFinite(ttMs))throw new RangeError('Invalid TT time');return ttMs-32184;}

export function clockDate(clock, elapsedSeconds = 0, now = Date.now()) {
  const epoch = clock?.utc ? validDate(clock.utc).valueOf() : now;
  return new Date(epoch + (clock?.paused ? 0 : elapsedSeconds*(clock?.rate ?? 1)*1000));
}

export function julianDate(value) { return validDate(value).valueOf()/DAY_MS+2440587.5; }

// IAU 1982 GMST, as required for Vallado TEME -> PEF; UT1 is not UTC.
export function gmst(value, dut1Seconds = 0) {
  const t = (julianDate(value)+dut1Seconds/86400-2451545)/36525;
  const seconds = 67310.54841+(876600*3600+8640184.812866)*t+0.093104*t*t-6.2e-6*t*t*t;
  return ((seconds*Math.PI/43200)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
}
