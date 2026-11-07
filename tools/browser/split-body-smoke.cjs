const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/frontier/split-body-browser');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 },
    recordVideo: { dir: out, size: { width: 1280, height: 960 } } });
  const page = await context.newPage();
  const errors = [], failures = [], snapshots = {};
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location().url}`); });
  page.on('requestfailed', r => failures.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  const read = async () => { const raw = await page.locator('.animation-lab').getAttribute('data-session-report'); return raw ? JSON.parse(raw) : null; };
  const wait = async (check, label) => {
    const end = Date.now()+15000;
    while (Date.now() < end) { const s = await read(); if (s && check(s)) return s; await page.waitForTimeout(80); }
    throw new Error(`${label}: ${JSON.stringify(await read())}`);
  };
  const region = i => page.getByRole('region', { name: `实例 ${i ? 'B' : 'A'}`, exact: true });
  const click = (i, name) => region(i).getByRole('button', { name, exact: true }).click();
  async function slider(i, label, value) {
    await region(i).getByLabel(label, { exact: true }).evaluate((el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  try {
    await page.goto(`${process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173/'}#/games/test-game?view=animation&asset=moss-runner`, { waitUntil: 'networkidle' });
    await wait(s => s.kind === 'moss-runner' && s.alive === 2, 'load');
    for (const i of [0, 1]) { await click(i, '行走'); await slider(i, '动作进度', .18); }
    await click(0, '上身攻击'); await slider(0, '上身进度', .55);
    let s = await wait(s => s.actors[0].upperBody.paused && Math.abs(s.actors[0].upperBody.time-.55)<.015, 'split pose');
    assert.equal(s.actors[1].upperBody.playing, false);
    assert.equal(s.actors[0].time, s.actors[1].time);
    assert.notDeepEqual(s.actors[0].pose, s.actors[1].pose);
    snapshots.comparison = s;
    await page.screenshot({ path: path.join(out, 'comparison.png') });
    await slider(0, '上身混合权重', 0);
    s = await wait(s => s.actors[0].upperBody.weight === 0 && JSON.stringify(s.actors[0].pose) === JSON.stringify(s.actors[1].pose), 'zero weight restores base pose');
    assert.deepEqual(s.actors[0].pose, s.actors[1].pose);
    await slider(0, '上身混合权重', .5);
    snapshots.half = await wait(s => s.actors[0].upperBody.weight === .5, 'half weight');
    await slider(0, '上身混合权重', 1);
    await click(0, '继续下身');
    const upperTime = (await read()).actors[0].upperBody.time;
    s = await wait(s => s.actors[0].time !== .18, 'lower continues with held upper');
    assert.equal(s.actors[0].upperBody.time, upperTime);
    await click(0, '循环上身攻击'); await click(0, '暂停下身');
    s = await wait(s => s.actors[0].state === 'paused', 'lower paused');
    const lowerTime = s.actors[0].time, startingUpper = s.actors[0].upperBody.time;
    s = await wait(s => Math.abs(s.actors[0].upperBody.time-startingUpper) > .1, 'upper continues with held lower');
    assert.equal(s.actors[0].time, lowerTime);
    await region(0).getByLabel('上身速度', { exact: true }).selectOption('0.5');
    await click(0, '继续下身'); await click(1, '继续下身');
    await page.waitForTimeout(2200);
    snapshots.running = await read();
    await page.screenshot({ path: path.join(out, 'running.png') });
    await click(0, '停止上身攻击');
    await wait(s => !s.actors[0].upperBody.playing, 'manual fade return');
    await click(0, '上身攻击');
    s = await wait(s => s.actors[0].upperBody.finishes === 1 && !s.actors[0].upperBody.playing, 'one shot returns');
    assert.equal(s.actors[0].state, 'playing');
    await click(0, '循环上身攻击'); await click(0, '死亡');
    s = await wait(s => s.actors[0].state === 'finished', 'death');
    assert.equal(s.actors[0].upperBody.available, false);
    assert.equal(s.actors[0].upperBody.playing, false);
    assert.equal(await region(0).getByRole('button', { name: '上身攻击', exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(out, 'death.png') });
    await click(0, '复位'); await click(0, '行走'); await click(0, '循环上身攻击');
    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const canvas = await page.locator('.lab-canvas').boundingBox();
      assert.ok(canvas.height >= 140, `${name}: visible canvas`);
      await region(0).getByRole('button', { name: '停止上身攻击', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      await click(0, '停止上身攻击'); await wait(s => !s.actors[0].upperBody.playing, 'small viewport stop');
      await click(0, '循环上身攻击');
    }
    await page.getByRole('button', { name: '卸载资源', exact: true }).click();
    s = await wait(s => s.closed && s.alive === 0, 'unload');
    assert.deepEqual(s.resourceDisposals, s.resourceCounts);
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await wait(s => !s.closed && s.alive === 2, 'reload');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ snapshots, errors, failures }, null, 2));
    console.log('Split-body browser checks passed: independent controls, weight equivalence, combined playback, return, death, reload and small viewport controls.');
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
