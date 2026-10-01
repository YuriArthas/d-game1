const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/placement');
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
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
      page.on('requestfailed', request => failures.push(request.url()));
      await page.goto(`${base}/#/games/test-game?view=placement`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!document.querySelector('canvas')?.dataset.placementCamera);
      const read = () => page.locator('.placement-lab').evaluate(el => JSON.parse(el.dataset.placementReport));
      const resources = () => page.locator('.placement-lab').evaluate(el => JSON.parse(el.dataset.placementResources));
      const click = name => touch ? page.getByRole('button', { name, exact: true }).tap() : page.getByRole('button', { name, exact: true }).click();
      const point = cell => page.locator('.placement-lab').evaluate((el, cell) => {
        const grid = JSON.parse(el.dataset.placementGrid), canvas = el.querySelector('canvas');
        const { projection, view } = JSON.parse(canvas.dataset.placementCamera);
        const multiply = (m, v) => [0, 1, 2, 3].map(row => m[row] * v[0] + m[4 + row] * v[1] + m[8 + row] * v[2] + m[12 + row] * v[3]);
        const clip = multiply(projection, multiply(view, [grid.origin[0] + (cell[0] + .5) * grid.cellSize, 0, grid.origin[1] + (cell[1] + .5) * grid.cellSize, 1]));
        const rect = canvas.getBoundingClientRect();
        return { x: rect.x + (clip[0] / clip[3] + 1) * rect.width / 2, y: rect.y + (1 - clip[1] / clip[3]) * rect.height / 2 };
      }, cell);
      const select = async cell => {
        const p = await point(cell);
        if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(80);
      };
      const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });
      return { context, page, read, resources, click, point, select, shot };
    }

    const desktop = await setup({ width: 1280, height: 800 });
    const { page, read, resources, click, point, select, shot } = desktop;
    assert.equal((await read()).gold, 100); assert.equal((await resources()).active, 1);
    await select([1, 1]); assert.equal((await read()).failure, 'unbuildable');
    assert.equal(await page.getByRole('button', { name: '确认建造', exact: true }).isEnabled(), false);
    await select([0, 0]); assert.deepEqual((await read()).selected, [0, 0]);
    assert.equal((await read()).gold, 100); assert.equal((await read()).towers.length, 0);
    await shot('desktop-preview');
    await click('取消'); assert.equal((await read()).selected, null);
    await select([0, 0]); await click('暂停');
    await select([1, 0]); assert.deepEqual((await read()).selected, [0, 0]);
    assert.equal((await read()).failure, 'paused');
    await click('恢复'); await click('确认建造');
    let state = await read(); assert.equal(state.gold, 70); assert.equal(state.towers.length, 1); assert.equal(state.selected, null);
    await select([0, 0]); assert.equal((await read()).failure, 'occupied');
    await click('取消');
    await select([1, 0]);
    const beforeUi = await read();
    await page.getByLabel('帧耗时', { exact: true }).uncheck();
    assert.deepEqual(await read(), beforeUi); // controls do not change map selection
    await page.getByRole('button', { name: '确认建造', exact: true }).dblclick();
    assert.equal((await read()).gold, 40); assert.equal((await read()).towers.length, 2);
    await select([4, 1]); await click('确认建造');
    await select([5, 1]);
    state = await read(); assert.equal(state.failure, 'insufficient-gold'); assert.equal(state.gold, 10); assert.equal(state.towers.length, 3);
    evidence.desktop = { world: state, resources: await resources() };
    await shot('desktop-built');
    await click('重新开始');
    assert.equal((await read()).gold, 100); assert.equal((await read()).towers.length, 0); assert.equal((await resources()).active, 1);
    assert.equal((await resources()).geometryDisposals, 0);
    const p = await point([0, 0]), q = await point([1, 0]);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 5 }); await page.mouse.up();
    assert.equal((await read()).selected, null); // drag is not a tap
    await select([0, 0]); await page.keyboard.press('Escape'); assert.equal((await read()).selected, null);
    evidence.resetCycles = [];
    for (let i = 0; i < 3; i++) {
      await select([0, 0]); await click('确认建造'); await click('重新开始');
      const r = await resources(); assert.equal(r.active, 1); assert.equal(r.created - r.released, 1); assert.equal(r.geometryDisposals, 0);
      evidence.resetCycles.push(r);
    }
    await click('运行时验证'); await click('开始 / 继续');
    await page.waitForFunction(() => JSON.parse(document.querySelector('.runtime-lab').dataset.runtimeReport).activeCount > 0);
    await click('网格建造'); await page.waitForSelector('.placement-lab');
    assert.equal((await read()).gold, 100); assert.equal((await resources()).active, 1);
    await desktop.context.close();

    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      const mobile = await setup({ width, height }, true);
      const cells = await mobile.page.locator('.placement-lab').evaluate(el => JSON.parse(el.dataset.placementGrid).buildableCells);
      for (const cell of cells) {
        const p = await mobile.point(cell);
        assert.equal(await mobile.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p), true);
        await mobile.select(cell);
        assert.deepEqual((await mobile.read()).selected, cell);
        assert.equal((await mobile.read()).failure, null);
      }
      await mobile.click('取消');
      const start = await mobile.point([0, 0]), finish = await mobile.point([1, 0]);
      const cdp = await mobile.context.newCDPSession(mobile.page);
      const touchPoint = (p, id = 1) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(start)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(finish)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal((await mobile.read()).selected, null);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(start)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal((await mobile.read()).selected, null);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(start)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(start), touchPoint(finish, 2)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal((await mobile.read()).selected, null); // two-finger gesture is not a placement tap
      await mobile.select([0, 0]); assert.deepEqual((await mobile.read()).selected, [0, 0]);
      await mobile.click('确认建造');
      assert.equal((await mobile.read()).gold, 70); assert.equal((await mobile.read()).towers.length, 1);
      await mobile.select([1, 0]); await mobile.click('取消');
      assert.equal((await mobile.read()).selected, null); assert.equal((await mobile.read()).gold, 70);
      await mobile.select([4, 1]); await mobile.click('确认建造');
      assert.equal((await mobile.read()).gold, 40);
      await mobile.select([1, 1]); assert.equal((await mobile.read()).failure, 'unbuildable');
      assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const canvas = await mobile.page.locator('.placement-canvas').boundingBox(); assert.ok(canvas.height > 180, JSON.stringify(canvas));
      const confirm = await mobile.page.getByRole('button', { name: '确认建造', exact: true }).boundingBox();
      assert.ok(confirm.height >= 44 && confirm.y + confirm.height <= height, JSON.stringify(confirm));
      const textLayout = await mobile.page.evaluate(() => {
        const range = document.createRange(); range.selectNodeContents(document.querySelector('.placement-message'));
        return { messageBottom: range.getBoundingClientRect().bottom, footnoteTop: document.querySelector('.placement-footnote').getBoundingClientRect().top };
      });
      assert.ok(textLayout.messageBottom <= textLayout.footnoteTop, JSON.stringify(textLayout));
      evidence[name] = { world: await mobile.read(), canvas, confirm };
      await mobile.shot(name);
      await mobile.context.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ base, evidence, errors, failures }, null, 2));
    console.log('Placement browser passed: preview/cancel, road/occupancy/gold, pause, double submit, UI isolation, drag/Escape, resets, reentry, landscape and portrait touch.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
