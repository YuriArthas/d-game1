import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPerformanceReportHandler,reportPath} from '../../server/performance-reports.mjs';

const origin='https://w-sunjun-public.dev.clock-p.com';
function fixture(){
  const frame={frame:15,startedAtMs:500,cpu:2,completionMs:12,gpu:9,gpuPassSumMs:14,gpuOverlapMs:5,draws:44,passes:2,
    gpuPasses:[{label:'Lighting',samples:4,ms:8,startMs:0,endMs:8},{label:'Composite',samples:1,ms:6,startMs:3,endMs:9}],
    context:{lightMode:'night',camera:{position:[1,2,3],target:[0,0,-1]},viewport:{width:390,height:655,dpr:1.5,bufferWidth:585,bufferHeight:982}}};
  return {schemaVersion:1,project:'mining-light',capturedAt:'2026-10-20T11:00:00.000Z',build:{module:origin+'/games/mining-light/assets/street-test.js'},device:{userAgent:'test-browser',adapter:{vendor:'apple'}},scene:{},latestFrame:frame,recentFrames:[frame]};
}
async function host(t,options={}){
  const directory=await mkdtemp(join(tmpdir(),'street-report-test-'));
  const server=createServer(createPerformanceReportHandler({directory,...options}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${server.address().port}${reportPath}`;
  return {directory,server,url,post:(report=fixture(),headers={})=>fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(report)})};
}
test('successful acknowledgment corresponds to a complete persistent file, not public GET',async t=>{
  const h=await host(t),data=fixture(),response=await h.post(data),receipt=await response.json();
  assert.equal(response.status,201);assert.equal(receipt.ok,true);assert.match(receipt.id,/^[\da-f-]{36}$/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(JSON.parse(await readFile(join(h.directory,receipt.id+'.json'),'utf8')),{id:receipt.id,receivedAt:receipt.receivedAt,report:data});
});
test('bad input, origin, and methods do not save reports',async t=>{
  const h=await host(t);
  assert.equal((await fetch(h.url)).status,405);
  assert.equal((await h.post(fixture(),{Origin:'https://elsewhere.invalid'})).status,403);
  assert.equal((await h.post(fixture(),{'Content-Type':'text/plain'})).status,415);
  assert.equal((await fetch(h.url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await h.post({})).status,422);
  const broken=fixture();broken.latestFrame.gpu=9;broken.latestFrame.gpuPassSumMs=null;
  assert.equal((await h.post(broken)).status,422);
  assert.deepEqual(await readdir(h.directory),[]);
});
test('large declared and chunked bodies receive 413',async t=>{
  const h=await host(t,{maxBytes:32});
  assert.equal((await h.post()).status,413);
  const status=await new Promise((resolve,reject)=>{
    const req=httpRequest(h.url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.write('x'.repeat(20));req.end('x'.repeat(20));
  });
  assert.equal(status,413);assert.deepEqual(await readdir(h.directory),[]);
});
test('serialized concurrent writes respect storage cap',async t=>{
  const h=await host(t,{maxReports:1});
  const responses=await Promise.all([h.post(),h.post()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,507]);
  assert.equal((await readdir(h.directory)).length,1);
});
test('rate limit is explicit and disabled GPU timing remains reportable',async t=>{
  const h=await host(t,{perMinute:1}),data=fixture();
  data.latestFrame.gpu=null;data.latestFrame.gpuPassSumMs=null;data.latestFrame.gpuOverlapMs=null;delete data.latestFrame.gpuPasses;
  assert.equal((await h.post(data)).status,201);
  const response=await h.post(data);assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
});
test('storage failure never returns success',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'street-report-blocked-')),blocked=join(directory,'file');
  await writeFile(blocked,'not a directory');t.after(()=>rm(directory,{recursive:true,force:true}));
  const h=await host(t,{directory:blocked});
  const response=await h.post();assert.equal(response.status,500);assert.equal((await response.json()).ok,false);
});
function historyFixture(count=1800){
  const report=fixture();report.schemaVersion=2;report.sessionId='b46fa3c8-d1ef-4d67-bdb6-7d733af5669b';
  const f=report.latestFrame;f.frame=count;f.reason='report';f.cpuOutsideStagesMs=0;f.newPipelines=0;f.newPrograms=0;f.cpuStages=[{label:'Lighting',inclusiveMs:2,exclusiveMs:2}];
  Object.assign(f.context,{ao:true,view:'entrance',shadowMode:'static visibility atlas',renderMode:'optimized',postMode:'optimized',probe:'none'});
  const {camera,...context}=f.context;
  report.history={capacity:1800,columns:['frame','startedAtMs','settings','reason','cpu','completionMs','gpu','gpuPassSumMs','gpuOverlapMs','draws','passes','eyeX','eyeY','eyeZ','targetX','targetY','targetZ','cpuStages','cpuOutsideStagesMs','newPipelines','newPrograms'],contexts:[context],stageLabels:['Lighting'],
    rows:Array.from({length:count},(_,i)=>[i+1,i*16,0,i===count-1?'report':'interaction',2,12,9,14,5,44,2,...camera.position,...camera.target,[[0,2,2]],0,0,0]),frameCount:count,gpuSampleCount:count,wallSpanMs:count*16,summary:[{context:0,reason:'interaction'}]};
  return report;
}
test('schema 2 saves a full compact history larger than the former 128 KiB limit',async t=>{
  const h=await host(t),data=historyFixture();
  assert.ok(Buffer.byteLength(JSON.stringify(data))>128*1024);
  const response=await h.post(data),receipt=await response.json();assert.equal(response.status,201);
  assert.deepEqual(JSON.parse(await readFile(join(h.directory,receipt.id+'.json'),'utf8')).report,data);
});
test('schema 2 rejects broken indices, ordering, counts, diagnostics, and unbounded histories',async t=>{
  const h=await host(t);
  for(const mutate of [
    r=>r.history.rows[0][2]=99,r=>r.history.rows[0][17][0][0]=99,r=>r.history.rows[1][0]=1,
    r=>r.history.gpuSampleCount=99,r=>r.history.frameCount=99,r=>r.history.columns.pop(),
    r=>r.latestFrame.cpuStages[0].exclusiveMs=3,r=>delete r.sessionId,r=>r.schemaVersion=3,
    r=>r.history.rows.push(r.history.rows.at(-1)),
  ]){const data=historyFixture(2);mutate(data);assert.equal((await h.post(data)).status,422);}
  assert.equal((await h.post(historyFixture(1801))).status,422);
  assert.deepEqual(await readdir(h.directory),[]);
});
test('schema 3 stores moving light positions and animation frames while preserving older schemas',async t=>{
 const h=await host(t),data=historyFixture(3);data.schemaVersion=3;
 const f=data.latestFrame;f.context.motion='moving';f.context.movingLight={seconds:2,position:[.65,1.12,6.2]};
 data.history.columns.push('movingTimeSeconds','lightX','lightY','lightZ');data.history.contexts[0].motion='moving';
 data.history.rows.forEach((r,i)=>{r[3]=i===2?'report':'animation';r.push(i,.65,1.12,7-i*.4);});data.history.summary[0].reason='animation';
 const response=await h.post(data);assert.equal(response.status,201);const receipt=await response.json();
 assert.deepEqual(JSON.parse(await readFile(join(h.directory,receipt.id+'.json'),'utf8')).report,data);
 const bad=structuredClone(data);bad.history.rows[0][22]='invalid';assert.equal((await h.post(bad)).status,422);
 const missing=structuredClone(data);delete missing.latestFrame.context.movingLight;assert.equal((await h.post(missing)).status,422);
});
