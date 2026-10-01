const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/p1-5-6');
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
  recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
 const page = await context.newPage();
 const errors=[],warnings=[],failures=[],snapshots={};
 let succeeded=false;
 page.on('pageerror', e=>errors.push(String(e)));
 page.on('console', m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
 page.on('requestfailed',r=>failures.push(r.url()));
 page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`)});
 const read = async()=>{const raw=await page.locator('.animation-lab').getAttribute('data-session-report');return raw?JSON.parse(raw):null};
 async function wait(check, label) {
  const until=Date.now()+20000;
  let state;
  while(Date.now()<until){state=await read();if(state&&check(state))return state;await page.waitForTimeout(100)}
  throw new Error(`${label}: ${JSON.stringify(state)}; errors=${errors}`);
 }
 const region=i=>page.getByRole('region',{name:`实例 ${i?'B':'A'}`,exact:true});
 const click=(i,name)=>region(i).getByRole('button',{name,exact:true}).click();
 async function seek(i,value){await region(i).getByLabel('动作进度',{exact:true}).evaluate((el,v)=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));
  el.dispatchEvent(new Event('input',{bubbles:true}));
 },value);await wait(s=>Math.abs(s.actors[i].time-value)<.015,'seek')}
 async function shot(name){await page.screenshot({path:path.join(out,name+'.png')})}
 function isolated(s){const [a,b]=s.actors;assert.notEqual(a.id,b.id);assert.notEqual(a.firstBoneId,b.firstBoneId);
  assert.ok(a.skeletonIds.every(id=>!b.skeletonIds.includes(id)));assert.equal(a.geometryId,b.geometryId);assert.equal(a.materialId,b.materialId)}
 try{
  await page.goto(process.env.PREVIEW_BASE_URL||'http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/塔防模型测试/}).click();
  let s=await wait(s=>s.alive===2,'tower load');isolated(s);snapshots.towerInitial=s;
  await shot('tower-ready');
  await click(0,'播放一次');await seek(0,.43);
  s=await read();assert.equal(s.actors[0].arrowVisible,true);assert.equal(s.actors[1].time,0);
  assert.notDeepEqual(s.actors[0].pose,s.actors[1].pose);snapshots.towerDrawn=s;await shot('tower-drawn');
  await seek(0,.65);s=await read();assert.equal(s.actors[0].arrowVisible,false);await shot('tower-released');
  await click(0,'复位');await wait(s=>s.actors[0].state==='ready','reset');
  await click(0,'播放一次');
  s=await wait(s=>s.actors[0].state==='finished','single shot end');assert.equal(s.actors[0].finishes,1);assert.equal(s.actors[0].time,1);
  const held=s.actors[0].pose;await page.waitForTimeout(350);assert.deepEqual((await read()).actors[0].pose,held);
  snapshots.towerFinished=await read();await shot('tower-finished');
  await click(0,'播放一次');await wait(s=>s.actors[0].state==='playing'&&s.actors[0].time<1,'replay');
  await click(0,'循环播放');await click(1,'循环播放');
  await region(1).getByLabel('播放速度').selectOption('0.5');
  await wait(s=>s.actors[0].loops>=2,'loop');
  await click(0,'暂停');s=await wait(s=>s.actors[0].state==='paused','pause');
  const t=s.actors[0].time,before=s.actors[1].loops+s.actors[1].time;
  s=await wait(s=>s.actors[1].loops+s.actors[1].time>before+.05,'B advances while A paused');
  assert.equal(s.actors[0].time,t);
  snapshots.towerIndependent=s;
  await click(0,'销毁实例');s=await wait(s=>s.alive===1,'destroy A');
  assert.deepEqual(s.resourceDisposals,{geometry:0,material:0,texture:0});const remainingId=s.actors[1].id;
  const remainingClock=s.actors[1].clock;
  await wait(s=>s.actors[1].clock>remainingClock+.3,'B advances after A destroyed');
  await shot('tower-only-b');
  await click(0,'创建实例');s=await wait(s=>s.alive===2,'recreate A');isolated(s);assert.equal(s.actors[1].id,remainingId);
  assert.notEqual(s.actors[0].id,snapshots.towerInitial.actors[0].id);await click(0,'播放一次');
  await wait(s=>s.actors[0].state==='finished','new actor playback');
  snapshots.towerRecreated=await read();
  await page.getByRole('button',{name:'卸载资源',exact:true}).click();
  s=await wait(s=>s.closed&&s.alive===0,'tower unload');
  assert.equal(s.created,s.destroyed);assert.deepEqual(s.resourceDisposals,s.resourceCounts);
  snapshots.towerUnloaded=s;
  await page.getByLabel('验证模型',{exact:true}).selectOption('skeleton');
  s=await wait(s=>s.kind==='skeleton'&&s.alive===2,'skeleton load');isolated(s);
  await click(0,'行走');await click(1,'死亡');
  s=await wait(s=>s.actors[1].state==='finished','death end');
  assert.equal(s.actors[0].state,'playing');assert.equal(s.actors[1].finishes,1);
  snapshots.skeletonDeath=s;await shot('skeleton-walk-and-death');
  const deathPose=s.actors[1].pose;
  await page.waitForTimeout(300);assert.deepEqual((await read()).actors[1].pose,deathPose);
  await click(0,'销毁实例');s=await wait(s=>s.alive===1,'destroy walking skeleton');
  assert.deepEqual(s.actors[1].pose,deathPose);assert.deepEqual(s.resourceDisposals,{geometry:0,material:0,texture:0});
  await click(0,'创建实例');s=await wait(s=>s.alive===2,'new skeleton');isolated(s);
  await click(0,'行走');await click(1,'待机');
  await wait(s=>s.actors[1].state==='playing'&&s.actors[1].motion==='idle','recover death');
  await seek(0,.2);await shot('skeleton-recreated');
  // Compare animation time advance at two speeds over equal wall time, using complete loop count.
  const samples=[];
  for(const speed of ['0.5','2']){
   await region(0).getByLabel('播放速度').selectOption(speed);
   const previousPlayback=(await read()).actors[0].playbackId;
   await click(0,'行走');
   let start=await wait(s=>s.actors[0].state==='playing'&&s.actors[0].playbackId>previousPlayback,'speed run');const started=Date.now();
   let end=await wait(s=>s.actors[0].clock>start.actors[0].clock+.8,'speed interval');const a=start.actors[0],b=end.actors[0];
   const advance=(b.loops-a.loops)*b.duration+b.time-a.time,elapsed=b.clock-a.clock;
   samples.push({speed:Number(speed),wall:(Date.now()-started)/1000,elapsed,advance});
   assert.ok(Math.abs(advance/elapsed-Number(speed))<.001);
  }
  snapshots.speedSamples=samples;
  await page.setViewportSize({width:844,height:390});await shot('landscape');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:390,height:844});await shot('portrait');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1280,height:900});
  snapshots.unloadCycles=[];
  for(let i=0;i<3;i++){
   await page.getByRole('button',{name:'卸载资源',exact:true}).click();
   s=await wait(s=>s.closed&&s.alive===0,'unload');await page.waitForTimeout(250);s=await read();
   assert.equal(s.created,s.destroyed);assert.deepEqual(s.resourceDisposals,s.resourceCounts);
   snapshots.unloadCycles.push(s);
   await page.getByRole('button',{name:'重新加载',exact:true}).click();await wait(s=>!s.closed&&s.alive===2,'reload');
  }
  assert.deepEqual(snapshots.unloadCycles[0].renderMemory,snapshots.unloadCycles[2].renderMemory);
  await page.getByRole('button',{name:'← 返回游戏列表',exact:true}).click();
  await page.getByRole('button',{name:/塔防模型测试/}).click();await wait(s=>s.kind==='tower'&&s.alive===2,'reenter');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({snapshots,errors,warnings,failures,recording:'walkthrough.webm'},null,2));
  succeeded=true;
  console.log('P1.5/P1.6 browser checks passed');
 }catch(e){await shot('failure');fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),state:await read(),errors,warnings,failures},null,2));throw e}
 finally{
  const recording=await page.video().path();
  await context.close();await browser.close();
  if(succeeded){
   fs.copyFileSync(recording,path.join(out,'walkthrough.webm'));
   for(const name of ['failure.json','failure.png'])fs.rmSync(path.join(out,name),{force:true});
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1});
