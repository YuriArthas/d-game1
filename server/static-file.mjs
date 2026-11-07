import {createReadStream,existsSync,statSync} from 'node:fs';
import {extname} from 'node:path';
import {createBrotliDecompress,createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream';
import {acceptsIdentity,selectContentEncoding} from './precompressed.mjs';

const isFile=path=>existsSync(path)&&statSync(path).isFile();

/** Serve standard HTTP representations, even if only a compressed GLB is stored. */
export function serveStaticFile(request,response,file,contentType){
  const originalExists=isFile(file),isGlb=extname(file)==='.glb';
  const available={br:isGlb&&isFile(file+'.br'),gzip:isGlb&&isFile(file+'.gz')};
  if(!originalExists&&!available.br&&!available.gzip)return false;
  const headers={'Content-Type':contentType,'Cache-Control':'no-cache'};
  let decoder;
  if(available.br||available.gzip){
    headers.Vary='Accept-Encoding';
    const accept=request.headers['accept-encoding'];
    const encoding=selectContentEncoding(accept,available);
    if(encoding){
      file+=encoding==='br'?'.br':'.gz';
      headers['Content-Encoding']=encoding;
    }else if(!acceptsIdentity(accept)){
      response.writeHead(406,{'Vary':'Accept-Encoding'});response.end();return true;
    }else if(!originalExists){
      // Identity is synthesized from the same stored bytes. No raw copy or
      // external asset is required; streaming avoids an unbounded response buffer.
      file+=available.br?'.br':'.gz';
      decoder=available.br?createBrotliDecompress:createGunzip;
    }
  }
  if(!decoder)headers['Content-Length']=statSync(file).size;
  response.writeHead(200,headers);
  if(request.method==='HEAD'){response.end();return true;}
  pipeline(...[createReadStream(file),...(decoder?[decoder()]:[]),response],error=>{
    if(error&&!response.destroyed)response.destroy(error);
  });
  return true;
}
