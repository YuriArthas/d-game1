const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/cavalry/browser');
fs.mkdirSync(out, {recursive:true});
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1280,height:1000},
    recordVideo:{dir:out,size:{width:1280,height:1000}}});
  const page = await context.newPage();
  const errors=[], failures=[], snapshots={};
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  page.on('requestfailed', r => failures.push(r.url()));
  page.on('response', r => { if (r.status()>=400) failures.push(`${r.status()} ${r.url()}`); });
  const read=async()=>{const raw=await page.locator('.animation-lab').getAttribute('data-session-report');return raw?JSON.parse(raw):null;};
  async function wait(check,label) {
    const until=Date.now()+15000;
    while(Date.now()<until) {const s=await read();if(s&&check(s))return s;await page.waitForTimeout(80);}
    throw new Error(`${label}: ${JSON.stringify(await read())}`);
  }
  const region=i=>page.getByRole('region',{name:`实例 ${i?'B':'A'}`,exact:true});
  const click=(i,name)=>region(i).getByRole('button',{name,exact:true}).click();
  async function slider(i,label,value) {
    await region(i).getByLabel(label,{exact:true}).evaluate((el,v)=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(v));
      el.dispatchEvent(new Event('input',{bubbles:true}));
    },value);
  }
  async function capture(name) {
    await page.waitForTimeout(150);
    snapshots[name]=await read();
    await page.screenshot({path:path.join(out,`${name}.png`)});
    await page.locator('.lab-canvas').screenshot({path:path.join(out,`${name}-canvas.png`)});
  }
  try {
    const base=process.env.PREVIEW_BASE_URL||'http://127.0.0.1:4173/';
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:/骑兵动作测试/}).click();
    let s=await wait(s=>s.kind==='cavalry'&&s.alive===2,'dedicated entry load');
    assert.deepEqual(s.resourceCounts,{geometry:1,material:1,texture:1});
    assert.equal(s.actors[0].skeletonIds.length,1);
    assert.notEqual(s.actors[0].skeletonIds[0],s.actors[1].skeletonIds[0]);
    const canvasBox=await page.locator('.lab-canvas canvas').boundingBox();
    const initialYaw=s.viewYaw;
    await page.mouse.move(canvasBox.x+canvasBox.width*.5,canvasBox.y+canvasBox.height*.5);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x+canvasBox.width*.7,canvasBox.y+canvasBox.height*.5,{steps:5});
    await page.mouse.up();
    s=await wait(s=>Math.abs(s.viewYaw-initialYaw)>.2,'drag rotation');
    for(const i of [0,1])await slider(i,'动作进度',0);
    await capture('idle');
    for(const angle of ['front','side','back']) {
      await page.getByLabel('观察角度',{exact:true}).selectOption(angle);
      await capture(angle);
    }
    await page.getByLabel('观察角度',{exact:true}).selectOption('perspective');
    for(const i of [0,1]){await click(i,'奔跑');await slider(i,'动作进度',.25);}
    await click(0,'上身攻击');await slider(0,'上身进度',.58);
    s=await wait(s=>s.actors[0].upperBody.paused&&Math.abs(s.actors[0].upperBody.time-.58)<.02,'upper attack pose');
    assert.equal(s.actors[0].time,s.actors[1].time);
    assert.notDeepEqual(s.actors[0].pose,s.actors[1].pose);
    await capture('run-attack');
    await slider(0,'上身混合权重',0);
    await wait(s=>JSON.stringify(s.actors[0].pose)===JSON.stringify(s.actors[1].pose),'weight zero restores base');
    await slider(0,'上身混合权重',.5);await capture('half-weight');
    await slider(0,'上身混合权重',1);
    const lowerTime=(await read()).actors[0].time;
    await click(0,'循环上身攻击');
    s=await wait(s=>s.actors[0].upperBody.time>.2,'upper continues while lower paused');
    assert.equal(s.actors[0].time,lowerTime);
    await click(0,'暂停上身');
    const heldUpper=(await wait(s=>s.actors[0].upperBody.paused,'upper paused')).actors[0].upperBody.time;
    await click(0,'继续下身');
    s=await wait(s=>Math.abs(s.actors[0].time-lowerTime)>.15,'lower continues while upper paused');
    assert.equal(s.actors[0].upperBody.time,heldUpper);
    await click(0,'停止上身攻击');await wait(s=>!s.actors[0].upperBody.playing,'manual return');
    await click(0,'上身攻击');await wait(s=>s.actors[0].upperBody.finishes===1&&!s.actors[0].upperBody.playing,'one-shot return');
    await click(0,'循环上身攻击');await click(0,'冲锋');
    s=await wait(s=>s.actors[0].motion==='charge'&&s.actors[0].loops>=1,'charge loop');
    assert.equal(s.actors[0].upperBody.available,false);
    assert.equal(s.actors[0].upperBody.playing,false);
    await slider(0,'动作进度',.32);await capture('charge');
    await click(0,'死亡');
    s=await wait(s=>s.actors[0].state==='finished','death complete');
    assert.equal(s.actors[0].finishes,1);const held=s.actors[0].pose;
    await page.waitForTimeout(200);assert.deepEqual((await read()).actors[0].pose,held);
    assert.equal(await region(0).getByRole('button',{name:'上身攻击',exact:true}).isDisabled(),true);
    await capture('dead');
    await click(0,'复位');await wait(s=>s.actors[0].motion==='idle'&&s.actors[0].upperBody.available,'reset');
    await click(0,'销毁实例');s=await wait(s=>s.alive===1,'destroy');
    assert.deepEqual(s.resourceDisposals,{geometry:0,material:0,texture:0});
    await click(0,'创建实例');await wait(s=>s.alive===2,'recreate');
    for(const [name,width,height] of [['landscape',844,390],['portrait',390,844]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.ok((await page.locator('.lab-canvas').boundingBox()).height>=140);
      await click(0,'奔跑');await click(0,'循环上身攻击');await page.waitForTimeout(400);
      await capture(name);
    }
    await page.setViewportSize({width:1280,height:1000});
    for(let cycle=0;cycle<3;cycle++) {
      await page.getByRole('button',{name:'卸载资源',exact:true}).click();
      s=await wait(s=>s.closed&&s.alive===0,'unload');
      assert.equal(s.created,s.destroyed);assert.deepEqual(s.resourceCounts,s.resourceDisposals);
      await page.getByRole('button',{name:'重新加载',exact:true}).click();await wait(s=>!s.closed&&s.alive===2,'reload');
    }
    // Old masked model still has its original upper layer after configuring cavalry.
    await page.goto(`${base}#/games/test-game?view=animation&asset=moss-runner`,{waitUntil:'networkidle'});
    await wait(s=>s.kind==='moss-runner'&&s.alive===2&&s.actors[0].upperBody.available,'runner regression');
    await click(0,'行走');await click(0,'上身攻击');
    await wait(s=>s.actors[0].upperBody.finishes===1&&!s.actors[0].upperBody.playing,'runner attack return');
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({snapshots,errors,failures},null,2));
    console.log('Cavalry browser passed: dedicated entry, actual textured GLB, 5 motions, views, independent clocks/instances, 0/50/100 weights, charge/death ownership, resource lifecycle, small viewports and runner regression.');
  } catch(e) {
    await page.screenshot({path:path.join(out,'failure.png')});
    fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),state:await read(),errors,failures},null,2));
    throw e;
  } finally {
    const recording=await page.video().path();await context.close();await browser.close();
    fs.copyFileSync(recording,path.join(out,'walkthrough.webm'));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
