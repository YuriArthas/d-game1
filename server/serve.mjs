import { existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStaticFile } from './static-file.mjs';
import { createPerformanceReportHandler, reportPath } from './performance-reports.mjs';
import { createMiningReportHandler, miningReportPath } from './mining-reports.mjs';
const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const port=Number(process.env.PORT??4173);
if(!existsSync(join(root,'index.html'))) throw new Error('dist/index.html missing. Run npm run build.');
const mime={'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wav':'audio/wav','.mp3':'audio/mpeg','.glb':'model/gltf-binary','.woff2':'font/woff2'};
const performanceReports=createPerformanceReportHandler();
const miningReports=createMiningReportHandler();
const server=createServer((request,response)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end('Invalid URL');return;}
  if(pathname===reportPath){void performanceReports(request,response);return;}
  if(pathname===miningReportPath){void miningReports(request,response);return;}
  if(!['GET','HEAD'].includes(request.method)) {response.writeHead(405);response.end();return;}
  let file=resolve(root,'.'+pathname);
  if((file!==root&&!file.startsWith(root+sep))||pathname.includes('\0')) {response.writeHead(403);response.end();return;}
  if(existsSync(file)&&statSync(file).isDirectory()) {
    if(!pathname.endsWith('/')) {response.writeHead(308,{Location:pathname+'/'+new URL(request.url,'http://localhost').search});response.end();return;}
    file=join(file,'index.html');
  }
  if(!serveStaticFile(request,response,file,mime[extname(file)]??'application/octet-stream')){
    response.writeHead(404);response.end('Not found');
  }
});
server.listen(port,()=>console.log(`Static game server http://localhost:${server.address().port}`));
