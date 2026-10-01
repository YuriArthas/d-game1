const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:900,height:650}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_disjoint_timer_query_webgl2'?null:original.call(this,name)};});
  await page.goto(`${process.env.PREVIEW_BASE_URL||'http://127.0.0.1:4173'}/#/games/test-game?view=runtime`);
  const click=name=>page.getByRole('button',{name,exact:true}).click();
  const wait=check=>page.waitForFunction(check,{},{timeout:45000});
  await page.getByLabel('运行时模型').selectOption('skeleton');
  await click('开始 / 继续');await wait(()=>JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).activeCount===3);
  await wait(()=>JSON.parse(document.querySelector('.frame-hud').dataset.frameReport).frame>5);
  const perf=await page.locator('.frame-hud').evaluate(el=>JSON.parse(el.dataset.frameReport));
  assert.equal(perf.gpuStatus,'不可用');assert.equal(perf.gpuMs,null);assert.ok(perf.cpuMs>0);
  await click('重新开始');await click('开始 / 继续');await wait(()=>JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).activeCount===3);
  await click('卸载资源');await wait(()=>JSON.parse(document.querySelector('.runtime-lab').dataset.resourceReport).closed);
  await click('重载资源');await click('开始 / 继续');await wait(()=>JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).activeCount===3);
  await click('← 返回游戏列表');await page.getByRole('button',{name:/塔防模型测试/}).click();await click('运行时验证');await click('开始 / 继续');
  await wait(()=>JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).activeCount===3);
  assert.deepEqual(errors,[]);console.log('GPU unavailable fallback, CPU sampling, model/reset/unload/reload and reentry passed.',process.env.PREVIEW_BASE_URL||'production');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
