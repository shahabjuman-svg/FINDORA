import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';

async function withServer(app,callback){
  const server=http.createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await callback(`http://127.0.0.1:${server.address().port}`)}
  finally{await new Promise(resolve=>server.close(resolve))}
}
test('health endpoint returns JSON',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/api/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
}));
test('public index is served as HTML',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);
  assert.match(await r.text(),/Findora/);
}));
test('security headers are supplied',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
}));
test('config hides API key and reports live disabled',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/api/config');const data=await r.json();assert.equal(data.liveEnabled,false);
  assert.ok(data.cities.includes('Abu Dhabi'));assert.doesNotMatch(JSON.stringify(data),/SECRET/);
}));
test('demo search returns matching offers',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/api/search?q=air%20fryer&mode=demo');const data=await r.json();
  assert.equal(r.status,200);assert.equal(data.mode,'demo');assert.ok(data.products.length>=2);
  assert.match(data.coverageNote,/illustrative/i);
}));
test('live search without credential fails explicitly',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/api/search?q=air%20fryer&mode=live');const data=await r.json();
  assert.equal(r.status,503);assert.match(data.error,/not configured/i);
}));
test('live search with key uses connected provider',async()=>withServer(createApp({key:'SECRET',liveSearch:async(query,city,key)=>{
  assert.equal(query,'air fryer');assert.equal(city,'Dubai');assert.equal(key,'SECRET');
  return {products:[{id:'1',title:'Example'}],coverageNote:'Source data'};
}}),async base=>{
  const r=await fetch(base+'/api/search?q=air%20fryer&city=Dubai&mode=live');const data=await r.json();
  assert.equal(r.status,200);assert.equal(data.products.length,1);assert.equal(data.mode,'live');
  assert.doesNotMatch(JSON.stringify(data),/SECRET/);
}));
test('empty live search is rejected',async()=>withServer(createApp({key:'SECRET'}),async base=>{
  const r=await fetch(base+'/api/search?mode=live');assert.equal(r.status,400);
}));
test('overlong query is rejected',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/api/search?mode=demo&q='+'a'.repeat(261));assert.equal(r.status,400);
}));
test('POST requests are rejected',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/api/search',{method:'POST'});assert.equal(r.status,405);
}));
test('missing static asset returns 404',async()=>withServer(createApp({key:''}),async base=>{
  const r=await fetch(base+'/not-found.css');assert.equal(r.status,404);
}));
test('live upstream failures return 502 without exposing secrets',async()=>withServer(createApp({key:'SECRET',liveSearch:async()=>{throw Error('Provider failed: SECRET')}}),async base=>{
  const r=await fetch(base+'/api/search?q=privateQuery&mode=live');assert.equal(r.status,502);
  assert.doesNotMatch(await r.text(),/SECRET/);
}));

test('live rate limit protects the paid data provider',async()=>withServer(createApp({key:'SECRET',liveSearch:async()=>({products:[],coverageNote:'Example'})}),async base=>{
  let last;
  for(let i=0;i<21;i++) last=await fetch(base+`/api/search?q=rate-${i}&mode=live`);
  assert.equal(last.status,429);
}));
