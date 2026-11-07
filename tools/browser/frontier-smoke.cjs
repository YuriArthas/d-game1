const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/frontier/browser');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
    recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
  const page = await context.newPage();
  const errors = [], failures = [], results = {};
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failures.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  const read = async () => { const raw = await page.locator('.animation-lab').getAttribute('data-session-report'); return raw ? JSON.parse(raw) : null; };
  const wait = async (check, label) => {
    const until = Date.now()+20000;
    while (Date.now() < until) { const s = await read(); if (s && check(s)) return s; await page.waitForTimeout(100); }
    throw new Error(`${label}: ${JSON.stringify(await read())}; errors=${errors}`);
  };
  const region = i => page.getByRole('region', { name: `实例 ${i ? 'B' : 'A'}`, exact: true });
  const click = (i, name) => region(i).getByRole('button', { name, exact: true }).click();
  const seek = async (i, t) => {
    await region(i).getByLabel('动作进度', { exact: true }).evaluate((el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, t);
    await wait(s => Math.abs(s.actors[i].time-t) < .02, 'seek');
  };
  try {
    const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173/';
    await page.goto(`${base}#/games/test-game?view=animation&asset=bone-crawler`, { waitUntil: 'networkidle' });
    for (const kind of ['bone-crawler', 'moss-runner', 'stone-brute', 'cannon-tower', 'frost-tower']) {
      await page.getByLabel('验证模型', { exact: true }).selectOption(kind);
      let s = await wait(s => s.kind === kind && s.alive === 2, 'load');
      const [a, b] = s.actors;
      assert.notEqual(a.firstBoneId, b.firstBoneId);
      assert.equal(a.skeletonIds.length, 1); assert.equal(b.skeletonIds.length, 1);
      assert.notEqual(a.skeletonIds[0], b.skeletonIds[0]);
      assert.equal(a.geometryId, b.geometryId);
      const enemy = !kind.endsWith('tower');
      await click(0, enemy ? '行走' : '循环播放');
      await click(1, enemy ? '待机' : '复位');
      await page.waitForTimeout(1400);
      await seek(0, enemy ? kind === 'stone-brute' ? .33 : .20 : kind === 'frost-tower' ? .6 : .44);
      await seek(1, 0);
      s = await read();
      assert.notDeepEqual(s.actors[0].pose, s.actors[1].pose);
      await page.screenshot({ path: path.join(out, `${kind}-motion.png`) });
      results[kind] = { sampled: s };
      await click(0, enemy ? '死亡' : '播放一次');
      s = await wait(s => s.actors[0].state === 'finished', 'one-shot end');
      assert.equal(s.actors[0].finishes, 1);
      const held = s.actors[0].pose;
      await page.waitForTimeout(250); assert.deepEqual((await read()).actors[0].pose, held);
      await page.screenshot({ path: path.join(out, `${kind}-finished.png`) });
      await click(0, '复位');
      await wait(s => s.actors[0].motion === (enemy || kind === 'frost-tower' ? 'idle' : 'ready'), 'reset');
      await click(0, '销毁实例');
      s = await wait(s => s.alive === 1, 'destroy');
      assert.deepEqual(s.resourceDisposals, { geometry: 0, material: 0, texture: 0 });
      await click(0, '创建实例'); await wait(s => s.alive === 2, 'recreate');
      await page.getByRole('button', { name: '卸载资源', exact: true }).click();
      s = await wait(s => s.closed && s.alive === 0, 'unload');
      assert.equal(s.created, s.destroyed);
      assert.deepEqual(s.resourceCounts, s.resourceDisposals);
      results[kind].released = s;
    }
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await wait(s => !s.closed && s.alive === 2, 'reload');
    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ results, errors, failures }, null, 2));
    console.log('Frontier browser checks passed: five models, clips, isolated instances, reset/recreate, owned resources, viewport layouts.');
  } catch (e) {
    await page.screenshot({ path: path.join(out, 'failure.png') });
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(e), state: await read(), errors, failures }, null, 2));
    throw e;
  } finally {
    const recording = await page.video().path();
    await context.close(); await browser.close();
    fs.copyFileSync(recording, path.join(out, 'walkthrough.webm'));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
