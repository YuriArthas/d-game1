const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/runtime-review'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [], requests = [], evidence = {};
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => requests.push(r.url()));
    page.on('response', r => { if (r.status() >= 400) requests.push(`${r.status()} ${r.url()}`); });
    const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173';
    await page.goto(`${base}/#/games/test-game?view=runtime`, { waitUntil: 'networkidle' });
    const read = async () => { const raw = await page.locator('.runtime-lab').getAttribute('data-runtime-report'); return raw && JSON.parse(raw); };
    const wait = async (check, label, timeout = 45000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { const state = await read(); if (state && check(state)) return state; await page.waitForTimeout(100); }
      throw new Error(`${label}: ${JSON.stringify(await read())}`);
    };
    const click = name => page.getByRole('button', { name, exact: true }).click();
    const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });
    await wait(s => s.pendingCount === 3 && s.retainedCount === 0, 'small ready');
    assert.equal('units' in await read(), false); // actor inspection is opt-in
    await click('开始 / 继续');
    await wait(s => s.activeCount === 3, 'small schedule');
    await click('暂停'); const paused = await wait(s => s.paused, 'pause');
    await page.waitForTimeout(350); assert.deepEqual(await read(), paused);
    evidence.smallPaused = paused;
    await click('重新开始');
    await wait(s => s.generation === 2 && s.pendingCount === 3 && s.retainedCount === 0, 'reset');
    await page.getByLabel('运行时场景').selectOption('p2-lifecycle-50');
    const empty = await wait(s => s.levelId === 'p2-lifecycle-50' && s.renderMemory.geometries === 6, 'large baseline');
    evidence.baseline = empty;
    await page.getByText('数据与释放记录', { exact: true }).click();
    await wait(s => Array.isArray(s.units), 'details enabled');
    await click('开始 / 继续'); await wait(s => s.activeCount === 50, 'all 50 scheduled'); await click('暂停');
    evidence.active = await wait(s => s.paused && s.renderMemory.geometries === 56, '50 rendered');
    assert.equal(new Set(evidence.active.units.map(u => u.routeId)).size, 5);
    await shot('50-active');
    await click('击杀 10 个');
    const dying = await wait(s => s.deadCount === 10 && s.dyingCount === 10 && s.activeCount === 40, 'logical death');
    await page.waitForTimeout(350); assert.deepEqual(await read(), dying);
    evidence.dying = dying; await shot('death-paused');
    await click('开始 / 继续'); await wait(s => s.releasedCount >= 10 && s.dyingCount === 0, 'death release');
    const final = await wait(s => s.escapedCount === 40 && s.releasedCount === 50 && s.renderMemory.geometries === 6, 'all released');
    assert.equal(final.retainedCount, 0); assert.equal(final.totalCreated, final.totalReleased);
    evidence.complete = final; await shot('released');
    evidence.cycles = [];
    for (let i = 0; i < 3; i++) {
      await click('重新开始'); await click('开始 / 继续');
      await wait(s => s.createdCount >= 10, 'spawn before restart');
      await click('重新开始');
      const state = await wait(s => s.retainedCount === 0 && s.renderMemory.geometries === 6, 'restart baseline');
      assert.equal(state.totalCreated, state.totalReleased); evidence.cycles.push(state);
    }
    await click('开始 / 继续'); await wait(s => s.activeCount === 50, 'layout sample'); await click('暂停');
    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const canvas = await page.locator('.runtime-canvas').boundingBox(); assert.ok(canvas.height > 90, JSON.stringify(canvas));
      await shot(name);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await click('← 返回游戏列表'); await page.getByRole('button', { name: /塔防模型测试/ }).click();
    await click('运行时验证'); await click('开始 / 继续'); await wait(s => s.activeCount === 3, 'reenter');
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ base, evidence, errors, requests }, null, 2));
    console.log(`Browser review passed: 3/50 units, timed multi-route spawning, death/pause, 56→6 geometries, three resets, resize and reentry (${base}).`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
