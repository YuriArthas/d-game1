import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMiningReportHandler,miningReportPath} from '../../server/mining-reports.mjs';

const origin='https://w-sunjun-public.dev.clock-p.com';
const fixture=()=>({
  schemaVersion:1,project:'mining',capturedAt:'2026-10-28T10:00:00.000Z',sessionId:'0f8fad5b-d9cb-469f-a165-70867728950e',
  build:{page:origin+'/games/mining-surface-play/index.html',module:origin+'/games/mining-surface-play/assets/index-test.js'},
  device:{userAgent:'test-browser',gpu:{renderer:'ANGLE (Apple, Apple M1)'}},render:{bufferWidth:1600,bufferHeight:900},game:{place:'surface'},
  summary:{seconds:30,fps:58.2},frames:{columns:['t','interval','cpu','flags','calls','triangles'],rows:[[1000,16.7,2.1,3,120,300000],[1016.7,16.7,2,3,121,300100]]},
  seconds:[{t:1,fps:59}],longTasks:[[1200,64]],animationFrames:[],
});
async function host(t){
  const directory=await mkdtemp(join(tmpdir(),'mining-report-test-'));
  const server=createServer(createMiningReportHandler({directory}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${server.address().port}${miningReportPath}`;
  return {directory,post:(report,headers={})=>fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(report)})};
}
test('a mining report is saved whole and acknowledged with its id',async t=>{
  const h=await host(t),data=fixture(),response=await h.post(data),receipt=await response.json();
  assert.equal(response.status,201);assert.equal(receipt.ok,true);assert.match(receipt.id,/^[\da-f-]{36}$/);
  assert.deepEqual(JSON.parse(await readFile(join(h.directory,receipt.id+'.json'),'utf8')),{id:receipt.id,receivedAt:receipt.receivedAt,report:data});
});
test('other projects, malformed frames and foreign origins are refused and not saved',async t=>{
  const h=await host(t);
  assert.equal((await h.post({...fixture(),project:'mining-light'})).status,422);
  const ragged=fixture();ragged.frames.rows[1]=[1,2];
  assert.equal((await h.post(ragged)).status,422);
  const nan=fixture();nan.frames.rows[0][1]='slow';
  assert.equal((await h.post(nan)).status,422);
  assert.equal((await h.post({...fixture(),device:{}})).status,422);
  assert.equal((await h.post(fixture(),{Origin:'https://example.com'})).status,403);
  assert.deepEqual((await readdir(h.directory)).filter(n=>n.endsWith('.json')),[]);
});
