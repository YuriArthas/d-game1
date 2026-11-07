import {randomUUID} from 'node:crypto';
import {mkdir,open,readdir,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const reportPath='/api/mining-light/performance-reports';
const publicOrigin='https://w-sunjun-public.dev.clock-p.com';
const defaultDirectory=fileURLToPath(new URL('../data/mining-light-reports/',import.meta.url));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const optionalNumber=v=>v===null||number(v);
const string=(v,max=1024)=>typeof v==='string'&&v.length>0&&v.length<=max;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const reasons=['startup','interaction','settings','metrics','report','diagnostic','animation'];
const columns=['frame','startedAtMs','settings','reason','cpu','completionMs','gpu','gpuPassSumMs','gpuOverlapMs','draws','passes','eyeX','eyeY','eyeZ','targetX','targetY','targetZ','cpuStages','cpuOutsideStagesMs','newPipelines','newPrograms'];
const motionColumns=[...columns,'movingTimeSeconds','lightX','lightY','lightZ'];
const motionMode=v=>['off','paused','moving'].includes(v);
const motionFrame=f=>motionMode(f.context.motion)&&object(f.context.movingLight)&&number(f.context.movingLight.seconds)&&vector(f.context.movingLight.position);
const viewport=v=>object(v)&&['width','height','dpr','bufferWidth','bufferHeight'].every(k=>number(v[k])&&v[k]>0);
const settings=c=>object(c)&&['day','night'].includes(c.lightMode)&&typeof c.ao==='boolean'&&
  ['view','shadowMode','renderMode','postMode','probe'].every(k=>string(c[k],128))&&viewport(c.viewport);
const validDiagnostics=f=>reasons.includes(f.reason)&&number(f.cpuOutsideStagesMs)&&integer(f.newPipelines)&&integer(f.newPrograms)&&
  Array.isArray(f.cpuStages)&&f.cpuStages.length<=256&&f.cpuStages.every(s=>object(s)&&string(s.label,128)&&number(s.inclusiveMs)&&number(s.exclusiveMs)&&s.exclusiveMs<=s.inclusiveMs);
function validHistory(h,latest,version){
  const expectedColumns=version===3?motionColumns:columns;
  if(!object(h)||h.capacity!==1800||!Array.isArray(h.columns)||JSON.stringify(h.columns)!==JSON.stringify(expectedColumns)||
    !Array.isArray(h.contexts)||!h.contexts.length||h.contexts.length>1800||!h.contexts.every(settings)||
    !Array.isArray(h.stageLabels)||h.stageLabels.length>256||!h.stageLabels.every(s=>string(s,128))||
    !Array.isArray(h.rows)||!h.rows.length||h.rows.length>1800||h.frameCount!==h.rows.length||!number(h.wallSpanMs)||
    !Array.isArray(h.summary)||h.summary.length>1800||(version===3&&!h.contexts.every(c=>motionMode(c.motion))))return false;
  let previous=0,previousTime=0,gpuCount=0;
  for(const r of h.rows){
    if(!Array.isArray(r)||r.length!==expectedColumns.length||!integer(r[0])||r[0]<=previous||!number(r[1])||r[1]<previousTime||
      !integer(r[2])||r[2]>=h.contexts.length||!reasons.includes(r[3])||!number(r[4])||
      ![5,6,7,8].every(i=>optionalNumber(r[i]))||!integer(r[9])||!integer(r[10])||
      !r.slice(11,17).every(v=>typeof v==='number'&&Number.isFinite(v))||!Array.isArray(r[17])||r[17].length>256||
      !r[17].every(s=>Array.isArray(s)&&s.length===3&&integer(s[0])&&s[0]<h.stageLabels.length&&number(s[1])&&number(s[2])&&s[2]<=s[1])||
      !number(r[18])||!integer(r[19])||!integer(r[20])||
      (r[6]===null?r[7]!==null||r[8]!==null:r[7]===null||r[8]===null)||
      (version===3&&(!number(r[21])||!vector(r.slice(22,25)))))return false;
    previous=r[0];previousTime=r[1];if(r[6]!==null)gpuCount++;
  }
  return previous===latest.frame&&h.gpuSampleCount===gpuCount&&h.summary.every(s=>object(s)&&integer(s.context)&&s.context<h.contexts.length&&reasons.includes(s.reason));
}
const validFrame=f=>object(f)&&Number.isSafeInteger(f.frame)&&f.frame>0&&number(f.cpu)&&optionalNumber(f.completionMs)&&
  optionalNumber(f.gpu)&&optionalNumber(f.gpuPassSumMs)&&optionalNumber(f.gpuOverlapMs)&&number(f.startedAtMs)&&
  number(f.draws)&&number(f.passes)&&object(f.context)&&['day','night'].includes(f.context.lightMode)&&
  object(f.context.camera)&&vector(f.context.camera.position)&&vector(f.context.camera.target)&&
  object(f.context.viewport)&&['width','height','dpr','bufferWidth','bufferHeight'].every(k=>number(f.context.viewport[k])&&f.context.viewport[k]>0)&&
  (f.gpu===null?f.gpuPassSumMs===null&&f.gpuOverlapMs===null:
    number(f.gpuPassSumMs)&&number(f.gpuOverlapMs)&&Array.isArray(f.gpuPasses)&&f.gpuPasses.length>0&&f.gpuPasses.length<=256&&
    f.gpuPasses.every(p=>object(p)&&string(p.label,128)&&number(p.ms)&&number(p.startMs)&&number(p.endMs)&&p.endMs>=p.startMs));

function validate(report){
  if(!object(report)||![1,2,3].includes(report.schemaVersion)||report.project!=='mining-light'||
    !string(report.capturedAt,40)||!Number.isFinite(Date.parse(report.capturedAt))||
    !object(report.build)||!string(report.build.module,1024)||!object(report.device)||!string(report.device.userAgent,2048)||
    !object(report.device.adapter)||!object(report.scene)||!validFrame(report.latestFrame)||report.latestFrame.completionMs===null||
    !Array.isArray(report.recentFrames)||report.recentFrames.length>150||!report.recentFrames.every(validFrame)||
    (report.schemaVersion>=2&&(!string(report.sessionId,64)||!/^[0-9a-f-]{36}$/.test(report.sessionId)||
      !validDiagnostics(report.latestFrame)||!report.recentFrames.every(validDiagnostics)||!validHistory(report.history,report.latestFrame,report.schemaVersion)))||
    (report.schemaVersion===3&&(!motionFrame(report.latestFrame)||!report.recentFrames.every(motionFrame)))){
    throw Object.assign(Error('性能报告格式不正确'),{status:422});
  }
}

/** The public host accepts explicit button submissions; reports stay outside dist. `check` throws (status 422) on a
 *  report it does not accept; other games pass their own (mining-reports.mjs). */
export function createPerformanceReportHandler({directory=defaultDirectory,origin=publicOrigin,maxBytes=2*1024*1024,maxReports=2000,perMinute=30,check=validate}={}){
  let windowStart=Date.now(),requests=0,writes=Promise.resolve();
  return async(request,response)=>{
    const reply=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(body));};
    try{
      if(request.method!=='POST'){response.setHeader('Allow','POST');reply(405,{ok:false,error:'请使用上报按钮提交报告'});return;}
      if(request.headers.origin!==origin){reply(403,{ok:false,error:'上报来源不允许'});return;}
      if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){reply(415,{ok:false,error:'报告必须使用 JSON'});return;}
      if(Date.now()-windowStart>=60000){windowStart=Date.now();requests=0;}
      if(++requests>perMinute){response.setHeader('Retry-After','60');reply(429,{ok:false,error:'上报过于频繁，请一分钟后重试'});return;}
      if(Number(request.headers['content-length'])>maxBytes){request.resume();reply(413,{ok:false,error:'性能报告过大'});return;}
      const chunks=[];let bytes=0;
      // Do not destroy the request on overflow: the caller must receive the error.
      const body=await new Promise((resolve,reject)=>{
        let failed=false;
        const timer=setTimeout(()=>{failed=true;reject(Object.assign(Error('接收报告超时'),{status:408}));},15000);timer.unref();
        request.on('data',chunk=>{
          if(failed)return;bytes+=chunk.length;
          if(bytes>maxBytes){failed=true;clearTimeout(timer);reject(Object.assign(Error('性能报告过大'),{status:413}));return;}
          chunks.push(chunk);
        });
        request.on('end',()=>{clearTimeout(timer);if(!failed)resolve(Buffer.concat(chunks).toString('utf8'));});
        request.on('error',e=>{clearTimeout(timer);reject(e);});
      });
      let report;try{report=JSON.parse(body);}catch{throw Object.assign(Error('报告不是有效的 JSON'),{status:400});}
      check(report);
      const id=randomUUID(),receivedAt=new Date().toISOString();
      const persist=async()=>{
        await mkdir(directory,{recursive:true,mode:0o700});
        if((await readdir(directory)).filter(name=>name.endsWith('.json')).length>=maxReports)throw Object.assign(Error('报告存储已满，请联系维护者'),{status:507});
        const temporary=join(directory,id+'.tmp');
        try{
          const file=await open(temporary,'wx',0o600);
          try{await file.writeFile(JSON.stringify({id,receivedAt,report})+'\n');await file.sync();}finally{await file.close();}
          await rename(temporary,join(directory,id+'.json'));
        }catch(error){await unlink(temporary).catch(()=>{});throw error;}
      };
      // Serialize the small writes so concurrent requests obey the storage limit.
      const saved=writes.then(persist);writes=saved.catch(()=>{});await saved;
      reply(201,{ok:true,id,receivedAt});
    }catch(error){
      const status=error.status??500;
      if(status===500)console.error('Performance report persistence failed:',error);
      if(!response.destroyed&&!response.headersSent)reply(status,{ok:false,error:status===500?'服务器保存失败，请稍后重试':error.message});
    }
  };
}
