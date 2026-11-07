import {fileURLToPath} from 'node:url';
import {createPerformanceReportHandler} from './performance-reports.mjs';

/** Mining's "report performance" button (games/mining-surface-play, games/mining-test): one JSON file per press,
 *  in data/mining-reports/ outside dist, with the same origin check, rate limit and atomic write as the street's
 *  reports. The game builds the report in src/game/presentation/PerformanceRecorder.ts. */
export const miningReportPath='/api/mining/performance-reports';
const defaultDirectory=fileURLToPath(new URL('../data/mining-reports/',import.meta.url));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const string=(v,max=1024)=>typeof v==='string'&&v.length>0&&v.length<=max;
const list=(v,max)=>Array.isArray(v)&&v.length<=max;
const finite=v=>typeof v==='number'&&Number.isFinite(v);

export function validateMiningReport(r){
  const frames=r?.frames;
  if(!object(r)||r.schemaVersion!==1||r.project!=='mining'||
    !string(r.capturedAt,40)||!Number.isFinite(Date.parse(r.capturedAt))||!string(r.sessionId,64)||!/^[0-9a-f-]{36}$/.test(r.sessionId)||
    !object(r.build)||!string(r.build.page,2048)||!object(r.device)||!string(r.device.userAgent,2048)||
    !object(r.render)||!object(r.game)||!object(r.summary)||
    !object(frames)||!list(frames.columns,16)||!frames.columns.every(c=>string(c,64))||!list(frames.rows,3600)||
    !frames.rows.every(row=>Array.isArray(row)&&row.length===frames.columns.length&&row.every(finite))||
    !list(r.seconds,600)||!r.seconds.every(object)||!list(r.longTasks,500)||!list(r.animationFrames,200)){
    throw Object.assign(Error('性能报告格式不正确'),{status:422});
  }
}

export const createMiningReportHandler=(options={})=>
  createPerformanceReportHandler({directory:defaultDirectory,maxBytes:1024*1024,check:validateMiningReport,...options});
