const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/placement');
fs.mkdirSync(out, { recursive: true });
const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    let release;
    const delayed = new Promise(resolve => release = resolve);
    await page.route('**/assets/arrow-tower/*.glb', async route => { await delayed; await route.continue(); });
    await page.goto(`${base}/#/games/test-game?view=placement`);
    await page.getByText('正在准备地图与箭塔…', { exact: true }).waitFor();
    await page.getByRole('button', { name: '运行时验证', exact: true }).click();
    release();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.placement-lab').count(), 0);
    await page.unroute('**/assets/arrow-tower/*.glb');
    await page.getByRole('button', { name: '网格建造', exact: true }).click();
    await page.waitForSelector('.placement-lab');
    const read = () => page.locator('.placement-lab').evaluate(el => ({ world: JSON.parse(el.dataset.placementReport), assets: JSON.parse(el.dataset.placementResources) }));
    const first = await read(); assert.equal(first.assets.active, 1); assert.equal(first.world.gold, 100);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '运行时验证', exact: true }).click();
      await page.getByRole('button', { name: '网格建造', exact: true }).click();
      await page.waitForSelector('.placement-lab');
      assert.deepEqual(await read(), first);
    }
    const missingAssets = ['**/assets/arrow-tower/arrow.glb', '**/assets/kaykit-skeletons/Skeleton_Minion.glb'];
    for (const asset of missingAssets) {
      await page.getByRole('button', { name: '运行时验证', exact: true }).click();
      await page.route(asset, route => route.fulfill({ status: 404, body: 'Deliberately missing combat asset for regression' }));
      await page.getByRole('button', { name: '网格建造', exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.locator('.placement-lab').count(), 0);
      await page.unroute(asset);
      await page.getByRole('button', { name: '重试加载', exact: true }).click();
      await page.waitForSelector('.placement-lab');
      assert.deepEqual(await read(), first);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'lifecycle-result.json'), JSON.stringify({ base, first, errors,
      lateLoadCancellation: true, reentries: 3, missingAssetsReported: missingAssets, explicitRetry: true }, null, 2));
    console.log('Placement lifecycle passed: late load after exit, repeated sessions, visible missing-asset failure and explicit retry.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
