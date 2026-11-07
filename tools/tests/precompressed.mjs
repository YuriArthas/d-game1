import assert from 'node:assert/strict';
import {test} from 'node:test';
import {acceptsGzip} from '../../server/precompressed.mjs';

for(const [header,expected] of [
  [undefined,false],['',false],['br',false],['gzip, deflate, br, zstd',true],
  ['GZip; q=0.5',true],['gzip;q=0, *;q=1',false],['*;q=0.5',true],
  ['gzip;q=0.000',false],['gzip;q=invalid',false],['gzip;q=2',false],
]) assert.equal(acceptsGzip(header),expected,`Accept-Encoding: ${header}`);
console.log('HTTP gzip negotiation checks passed.');

test('Brotli negotiation respects explicit refusal and quality, with identity when unsupported',async()=>{
  const {selectContentEncoding}=await import('../../server/precompressed.mjs');
  const both={br:true,gzip:true};
  assert.equal(selectContentEncoding('gzip, br',both),'br');
  assert.equal(selectContentEncoding('gzip;q=1, br;q=.5',both),'gzip');
  assert.equal(selectContentEncoding('br;q=0, *;q=1',both),'gzip');
  assert.equal(selectContentEncoding('',both),null);
  assert.equal(selectContentEncoding('br',{br:false,gzip:true}),null);
});
