const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/waves/browser');
fs.mkdirSync(out, { recursive: true });
const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const evidence = {}, errors = [], failures = [];
  try {
    async function setup(viewport, touch = false) {
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
      page.on('requestfailed', r => failures.push(r.url()));
      await page.goto(`${base}/#/games/test-game?view=placement`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!document.querySelector('canvas')?.dataset.placementCamera);
      const click = name => touch ? page.getByRole('button', { name, exact: true }).tap() : page.getByRole('button', { name, exact: true }).click();
      const summary = () => page.locator('[data-battle-summary]').evaluate(el => JSON.parse(el.dataset.battleSummary));
      const read = () => page.locator('[data-battle-report]').evaluate(el => JSON.parse(el.dataset.battleReport));
      const wait = (field, minimum) => page.waitForFunction(({ field, minimum }) => JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary)[field] >= minimum, { field, minimum }, { timeout: 60000 });
      const select = async cell => {
        const p = await page.locator('.placement-lab').evaluate((el, cell) => {
          const grid = JSON.parse(el.dataset.placementGrid), canvas = el.querySelector('canvas');
          const { projection, view } = JSON.parse(canvas.dataset.placementCamera);
          const mul = (m, v) => [0, 1, 2, 3].map(r => m[r] * v[0] + m[4+r] * v[1] + m[8+r] * v[2] + m[12+r] * v[3]);
          const v = mul(projection, mul(view, [grid.origin[0] + (cell[0]+.5)*grid.cellSize, 0, grid.origin[1] + (cell[1]+.5)*grid.cellSize, 1]));
          const rect = canvas.getBoundingClientRect(); return { x: rect.x + (v[0]/v[3]+1)*rect.width/2, y: rect.y + (1-v[1]/v[3])*rect.height/2 };
        }, cell);
        if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      };
      const build = async cell => { await select(cell); await click('确认建造'); };
      return { context, page, click, summary, read, wait, select, build };
    }
    const d = await setup({ width: 1280, height: 800 });
    await d.build([1, 0]); await d.build([3, 1]);
    await d.page.locator('.battle-details summary').click();
    const pauseButton = await d.page.getByRole('button', { name: '暂停', exact: true }).boundingBox();
    await d.click('开始波次');
    await d.wait('arrows', 1);
    await d.page.mouse.click(pauseButton.x + pauseButton.width / 2, pauseButton.y + pauseButton.height / 2);
    await d.page.waitForTimeout(200);
    const frozen = await d.read(); assert.ok(frozen.arrows > 0, 'pause must catch an actual flying arrow');
    await d.page.screenshot({ path: path.join(out, 'desktop-shot.png') });
    await d.page.waitForTimeout(700); assert.deepEqual(await d.read(), frozen);
    evidence.paused = frozen;
    await d.click('恢复'); await d.wait('kills', 1);
    assert.ok((await d.summary()).gold >= 45);
    // Build during combat using only pointer/UI interaction.
    await d.build([5, 1]); await d.wait('kills', 3);
    await d.page.screenshot({ path: path.join(out, 'desktop-battle.png') });
    const waitPhase = (page, phase) => page.waitForFunction(phase =>
      JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary).phase === phase, phase, { timeout: 90000 });
    await waitPhase(d.page, 'intermission');
    await d.page.waitForFunction(() => JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary).dying === 0);
    await d.page.waitForTimeout(200);
    evidence.waves = [await d.read()];
    assert.equal(evidence.waves[0].wave, 1); assert.equal(evidence.waves[0].gold, 60);
    await d.page.getByText('已获波次奖励 +10 金币', { exact: true }).waitFor();
    const resting = await d.summary(); await d.page.waitForTimeout(700); assert.deepEqual(await d.summary(), resting);
    await d.page.screenshot({ path: path.join(out, 'desktop-intermission.png') });
    await d.click('暂停');
    assert.equal(await d.page.getByRole('button', { name: '下一波', exact: true }).isEnabled(), false);
    await d.click('恢复');
    for (const [wave, cells] of [[2, [[0, 2]]], [3, [[1, 2], [4, 1]]]]) {
      const previous = await d.read();
      for (const cell of cells) await d.build(cell);
      await d.page.waitForFunction(gold => JSON.parse(document.querySelector('[data-battle-report]').dataset.battleReport).gold === gold,
        previous.gold - 30 * cells.length);
      const built = await d.read();
      assert.equal(built.gold, previous.gold - 30 * cells.length);
      await d.page.getByRole('button', { name: '下一波', exact: true }).dblclick();
      await d.page.waitForFunction(wave => JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary).wave === wave, wave);
      const started = await d.summary();
      assert.equal(started.lives, previous.lives); assert.equal(started.waveKills, 0); assert.equal(started.waveLeaks, 0);
      await waitPhase(d.page, wave === 3 ? 'won' : 'intermission');
      await d.page.waitForFunction(() => JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary).dying === 0);
      await d.page.waitForTimeout(200); const ended = await d.read(); evidence.waves.push(ended);
      assert.equal(ended.wave, wave);
      assert.equal(ended.waveKills + ended.waveLeaks, wave === 2 ? 14 : 18);
      assert.equal(ended.kills, previous.kills + ended.waveKills); assert.equal(ended.leaks, previous.leaks + ended.waveLeaks);
      assert.equal(ended.gold, built.gold + ended.waveKills * 5 + (wave === 2 ? 15 : 20));
      assert.deepEqual(ended.towers.slice(0, previous.towers.length).map(t => [t.id, t.cell]), previous.towers.map(t => [t.id, t.cell]));
    }
    const win = await d.read(); evidence.win = win;
    assert.equal(win.kills + win.leaks, 40); assert.equal(win.lives, 5 - win.leaks);
    assert.equal(win.gold, 100 - 180 + win.kills * 5 + 45);
    assert.equal(win.resources.towers.arrows, 0); assert.equal(win.resources.skeletons.activeViews, 0);
    assert.equal(win.resources.towers.arrowsCreated, win.resources.towers.arrowsReleased);
    assert.equal(win.resources.skeletons.created, win.resources.skeletons.released);
    assert.equal(await d.page.locator('.battle-waves .complete').count(), 3);
    assert.equal(await d.page.getByRole('button', { name: '开始波次', exact: true }).isEnabled(), false);
    await d.page.screenshot({ path: path.join(out, 'desktop-win.png') });
    await d.click('重新开始'); await d.page.waitForTimeout(200);
    let reset = await d.read(); assert.equal(reset.gold, 100); assert.equal(reset.lives, 5); assert.equal(reset.towers.length, 0); assert.equal(reset.wave, 0); assert.equal(reset.waveKills, 0);
    await d.page.screenshot({ path: path.join(out, 'desktop-reset.png') });
    assert.equal(reset.resources.towers.active, 1); assert.equal(reset.resources.skeletons.activeViews, 0);
    // Empty defense actually reaches the exit and loses; no wave reward.
    await d.click('开始波次');
    await d.page.waitForFunction(() => JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary).phase === 'lost', null, { timeout: 60000 });
    await d.page.waitForTimeout(200); const lost = await d.read(); evidence.lost = lost;
    assert.equal(lost.lives, 0); assert.equal(lost.gold, 100); assert.equal(lost.leaks, 5); assert.equal(lost.kills, 0);
    await d.page.screenshot({ path: path.join(out, 'desktop-loss.png') });
    await d.click('重新开始'); await d.page.waitForTimeout(200);
    reset = await d.read(); assert.equal(reset.resources.skeletons.activeViews, 0);
    assert.equal(reset.resources.skeletons.created, reset.resources.skeletons.released);
    // Reset while arrows/enemies are still live, then reenter the page.
    await d.build([0, 0]); await d.click('开始波次'); await d.wait('shots', 1);
    await d.click('重新开始'); await d.page.waitForTimeout(200);
    reset = await d.read(); assert.equal(reset.resources.towers.active, 1); assert.equal(reset.resources.towers.arrows, 0);
    assert.equal(reset.resources.skeletons.activeViews, 0); evidence.reset = reset;
    await d.click('运行时验证'); await d.click('网格建造');
    await d.page.waitForSelector('[data-battle-summary]'); assert.equal((await d.summary()).phase, 'ready');
    await d.context.close();
    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      const m = await setup({ width, height }, true);
      await m.build([0, 0]); await m.build([3, 1]); await m.click('开始波次');
      await m.wait('shots', 3); await m.click('暂停'); await m.page.waitForTimeout(200);
      const frozen = await m.summary(); await m.page.waitForTimeout(500); assert.deepEqual(await m.summary(), frozen);
      await m.page.screenshot({ path: path.join(out, `${name}-combat.png`) }); evidence[name] = frozen;
      await m.click('恢复'); await waitPhase(m.page, 'intermission');
      await m.page.getByRole('button', { name: '下一波', exact: true }).waitFor();
      await m.page.screenshot({ path: path.join(out, `${name}-intermission.png`) });
      await m.build([5, 1]); await m.click('下一波');
      await m.page.waitForFunction(() => JSON.parse(document.querySelector('[data-battle-summary]').dataset.battleSummary).wave === 2);
      await m.page.waitForTimeout(200);
      assert.equal((await m.summary()).waveKills, 0);
      await m.click('重新开始');
      await m.page.waitForTimeout(200); assert.equal((await m.summary()).gold, 100); assert.equal((await m.summary()).wave, 0);
      await m.context.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ base, evidence, errors, failures }, null, 2));
    console.log('Three-wave browser passed: combat/pause, intermission reward and rest, paused/double next-wave start, persistent towers/economy/lives, final victory, loss/reset/cleanup and mobile wave transitions.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
