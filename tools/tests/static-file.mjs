import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,request as httpRequest} from 'node:http';
import {brotliCompressSync,brotliDecompressSync,gzipSync,gunzipSync} from 'node:zlib';
import {serveStaticFile} from '../../server/static-file.mjs';

test('compressed-only GLBs are self-contained HTTP assets',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'compressed-only-'));
  const original=Buffer.from('glTF\0binary-content'.repeat(1000)),br=brotliCompressSync(original),gz=gzipSync(original);
  writeFileSync(join(directory,'only.glb.br'),br);
  writeFileSync(join(directory,'gzip.glb.gz'),gz);
  writeFileSync(join(directory,'both.glb'),original);writeFileSync(join(directory,'both.glb.br'),br);writeFileSync(join(directory,'both.glb.gz'),gz);
  writeFileSync(join(directory,'normal.js'),'normal asset');
  const server=createServer((req,res)=>{
    if(!serveStaticFile(req,res,join(directory,req.url.slice(1)),'application/octet-stream')){res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const get=(file,encoding,method='GET')=>new Promise((resolve,reject)=>{
    const req=httpRequest({host:'127.0.0.1',port:server.address().port,path:'/'+file,method,headers:encoding===undefined?{}:{'Accept-Encoding':encoding}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);
    });req.on('error',reject);req.end();
  });
  try{
    for(const encoding of ['br','gzip, br','br;q=.5, gzip;q=1']){
      const r=await get('only.glb',encoding);assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],'br');
      assert.equal(Number(r.headers['content-length']),br.length);assert.equal(r.headers.vary,'Accept-Encoding');assert.deepEqual(brotliDecompressSync(r.body),original);
    }
    for(const encoding of [undefined,'','identity','gzip','br;q=0','*;q=0, identity;q=1']){
      const r=await get('only.glb',encoding);assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],undefined);assert.equal(r.headers['content-length'],undefined);assert.deepEqual(r.body,original);
    }
    for(const encoding of ['*;q=0','br;q=0,identity;q=0','gzip,identity;q=0'])assert.equal((await get('only.glb',encoding)).status,406);
    for(const encoding of ['br','identity']){
      const head=await get('only.glb',encoding,'HEAD');assert.equal(head.status,200);assert.equal(head.body.length,0);
      assert.equal(head.headers['content-length'],encoding==='br'?String(br.length):undefined);
    }
    assert.deepEqual((await get('gzip.glb','identity')).body,original);
    assert.deepEqual(gunzipSync((await get('gzip.glb','gzip')).body),original);
    assert.deepEqual((await get('both.glb','identity')).body,original);
    assert.deepEqual(gunzipSync((await get('both.glb','gzip')).body),original);
    assert.equal((await get('normal.js','br')).body.toString(),'normal asset');
    assert.equal((await get('normal.js','br')).headers.vary,undefined);
    assert.equal((await get('missing.glb','br')).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
});
