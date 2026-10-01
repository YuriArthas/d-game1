const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/frame-render');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [], evidence = {};
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      window.renderProbe = { draws: 0, queries: 0 };
      for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'beginQuery']) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function (...args) {
          window.renderProbe[method === 'beginQuery' ? 'queries' : 'draws']++;
          return original.apply(this, args);
        };
      }
    });
    const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173';
    await page.goto(`${base}/#/games/test-game?view=runtime`, { waitUntil: 'networkidle' });
    const click = name => page.getByRole('button', { name, exact: true }).click();
    const world = () => page.locator('.runtime-lab').evaluate(el => JSON.parse(el.dataset.runtimeReport));
    const perf = () => page.locator('.frame-hud').evaluate(el => JSON.parse(el.dataset.frameReport));
    const wait = check => page.waitForFunction(check, {}, { timeout: 45000 });
    await page.getByLabel('运行时模型').selectOption('skeleton');
    await click('开始 / 继续');
    await wait(() => JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).activeCount === 3);
    await wait(() => JSON.parse(document.querySelector('.frame-hud').dataset.frameReport).gpuMs !== null);
    assert.equal('units' in await world(), false);
    evidence.enabled = await perf();

    await page.getByLabel('帧耗时', { exact: true }).uncheck();
    await wait(() => !document.querySelector('.frame-hud'));
    const before = await page.evaluate(() => ({ ...window.renderProbe }));
    const beforeWorld = await world();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ ...window.renderProbe }));
    assert.ok(after.draws > before.draws); // actual draw submissions continue without instrumentation
    assert.equal(after.queries, before.queries);
    assert.ok((await world()).elapsed > beforeWorld.elapsed);
    evidence.disabled = { before, after, world: await world() };
    await page.screenshot({ path: path.join(out, 'timing-disabled.png') });

    await page.getByLabel('帧耗时', { exact: true }).check();
    await wait(() => JSON.parse(document.querySelector('.frame-hud').dataset.frameReport).gpuMs !== null);
    assert.ok((await perf()).frame > evidence.enabled.frame);
    await click('暂停');
    const paused = await world();
    await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      window.contextLoss = gl.getExtension('WEBGL_lose_context');
      window.contextLoss.loseContext();
    });
    await wait(() => JSON.parse(document.querySelector('.frame-hud').dataset.frameReport).gpuStatus === '上下文丢失');
    assert.equal((await perf()).gpuMs, null);
    evidence.lost = await perf();
    await page.evaluate(() => window.contextLoss.restoreContext());
    await wait(() => JSON.parse(document.querySelector('.frame-hud').dataset.frameReport).gpuMs !== null);
    assert.equal((await world()).elapsed, paused.elapsed);
    evidence.restored = await perf();
    await click('击杀 10 个');
    await wait(() => JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).complete);
    await page.screenshot({ path: path.join(out, 'complete-before-cleanup.png') });
    await click('开始 / 继续');
    await wait(() => JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).retainedCount === 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ base, evidence, errors }, null, 2));
    console.log('Render submissions with timing disabled, query shutdown/restart, context loss/restore and completed-wave cleanup passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
