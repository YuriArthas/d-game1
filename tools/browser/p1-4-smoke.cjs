// Run with PLAYWRIGHT_MODULE and CHROMIUM_PATH set if Playwright is external to the project.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('artifacts/p1-4');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [], warnings = [], failedRequests = [], httpErrors = [], reports = {};
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
    page.on('requestfailed', r => failedRequests.push(r.url()));
    page.on('response', r => { if (r.status() >= 400) httpErrors.push({ url: r.url(), status: r.status() }); });
    await page.goto(process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /塔防模型测试/ }).click();
    async function ready() {
      await page.getByRole('status').filter({ hasText: '模型已加载' }).waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    for (const [kind, label] of [['tower', '箭塔'], ['bow', '独立弓'], ['arrow', '独立箭']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await ready();
      const report = JSON.parse(await page.getByRole('status').getAttribute('data-model-report'));
      assert.equal(report.kind, kind);
      assert.ok(Math.abs(report.bounds.min[1]) < 0.001, `${kind} floor`);
      reports[kind] = report;
      await page.screenshot({ path: path.join(output, `${kind}-desktop.png`) });
      if (kind === 'tower') {
        assert.ok(Math.abs(report.bounds.max[1] - 4.11023) < 0.001);
        assert.deepEqual(report.arrow, report.muzzle);
        [0, 3.12, 0.75].forEach((v, i) => assert.ok(Math.abs(report.muzzle[i] - v) < 0.001));
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(output, 'tower-static-later.png') });
      }
    }
    await page.getByRole('button', { name: '箭塔', exact: true }).click();
    await ready();
    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `tower-${name}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: '骷髅', exact: true }).click();
    await ready();
    await page.getByRole('button', { name: '行走', exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, 'skeleton-regression.png') });
    await page.getByRole('button', { name: '← 返回游戏列表', exact: true }).click();
    await page.getByRole('button', { name: /塔防模型测试/ }).click();
    await ready();
    const renderer = await page.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) };
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(httpErrors, []);
    const normalDiagnostics = {
      errors: [...errors], warnings: [...warnings],
      failedRequests: [...failedRequests], httpErrors: [...httpErrors],
    };
    // Missing-asset UI must report the failure rather than substituting another asset.
    await page.route('**/bow.glb', route => route.fulfill({ status: 404, body: 'Missing test asset' }));
    await page.getByRole('button', { name: '独立弓', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '加载失败' }).waitFor();
    await page.unroute('**/bow.glb');
    await page.getByRole('button', { name: '箭塔', exact: true }).click();
    await ready();
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ reports, renderer,
      normalDiagnostics,
      expectedFailureCheck: '404 shown in UI; tower reload succeeds',
      expectedFailureDiagnostics: { errors, failedRequests, httpErrors } }, null, 2));
    console.log('P1.4 static browser checks passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
