import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSatelliteSource, SATELLITE_DATA_ROOT } from '../../js/data/satellite-source.js'
const response = data => ({ok:true,json:async()=>data})
test('published data branch refreshes without rebuilding the page',async()=>{
  const calls=[]
  const result=await resolveSatelliteSource(async url=>{calls.push(url);return response(url.startsWith('data/')?{available:false,remote_status_url:SATELLITE_DATA_ROOT+'status.json'}:{available:true,fetched_at:'2026-11-12T00:00:00Z'})})
  assert.equal(result.url,SATELLITE_DATA_ROOT+'gp.json');assert.equal(calls.length,2)
})
test('bundled snapshot survives CDN failure and unknown sources are refused',async()=>{
  const result=await resolveSatelliteSource(async url=>{if(url.startsWith('https:'))throw Error('offline');return response({available:true,remote_status_url:SATELLITE_DATA_ROOT+'status.json'})})
  assert.equal(result.url,'data/satellites/gp.json')
  await assert.rejects(()=>resolveSatelliteSource(async()=>response({remote_status_url:'https://example.com/status.json'})),/Unrecognized/)
  await assert.rejects(()=>resolveSatelliteSource(async()=>response({available:false,error:'Provider suspended'})),/Provider suspended/)
})
