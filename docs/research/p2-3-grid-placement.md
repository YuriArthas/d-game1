# P2.3 网格建造验证

日期：2026-10-01。本记录保留首次建造检查点的范围。当时尚未接入攻击、奖励、漏怪扣命和胜负；这些功能已在后续 [单箭塔战斗](single-tower-combat.md) 落地。

[打开网格建造页](https://w-sunjun-user.dev.clock-p.com/#/games/test-game?view=placement)（沿用现有登录入口）。本地构建入口为 `http://localhost:4173/#/games/test-game?view=placement`。

## 现在可操作的内容

- 一张带折线路线的地图、17 个可建造格和现有箭塔 GLB；原始资产比例不变，每格 4 米，塔底约 2.2 米。
- 初始 100 金币，每座箭塔 30 金币。鼠标点击或触摸选格，半透明模型预览，确认后才创建塔、扣款和占格。
- 非法格、已占用、金币不足和暂停都有具体提示；确认按钮随判定禁用，World 在实际确认时再次依据当前状态决定结果。重复确认不会重复扣款。
- 取消或 Escape 清除预览，不改变金币和塔。拖动、取消触摸和双指操作不选格。
- 暂停保留预览但冻结改选与建造；恢复可继续。重开释放所有已建塔，恢复初始金币、清除选中状态并恢复可操作状态。
- CPU/GPU 面板保留，放在工具栏而不覆盖网格。横屏使用侧边建造面板，竖屏使用底部面板；紧凑导航可以横向滚动。

## 数据与职责

新增 `TowerData { id, cost }` 和地图内嵌 `BuildGridData { origin, cellSize, buildableCells }`，没有增加攻击、升级、footprint 或资源注册配置。`buildGrid` 只在需要建造的地图上定义；原有路线探针可以没有，进入建造世界时若缺失则报错，没有默认网格。

`BuildGrid` 做坐标换算和可建造集合查询；`PlacementWorld` 拥有金币及塔登记。唯一的格子 Map 同时表示占用，`TowerUnit` 拥有 View。确认时先检查游戏规则，成功创建 View 后才提交扣款及登记；资源错误直接抛出，失败不会留下费用或占用。不裁剪地图外坐标，不吞错跳过塔，也不自动修补内容。

预览是单独的表现对象，复用一份实例；不进入塔登记表。普通塔共享模板几何体、材质和贴图，拥有独立骨骼；预览只克隆需要半透明的材质。重开释放塔实例，保留模板和预览；页面退出清理全部实例及模板。异步资源晚于页面退出返回时立即清理。

把已经共用的 `FitCamera`、`disposeScene`、`cloneSkeletonModel` 放到 `rendering/`，建造代码不依赖测试页模块。没有新建通用 GameNode、策略注册表、对象池或升级系统。路线验证与建造验证暂时各自独立；下一步战斗闭环再合并已验证的职责。

## 验证

`npm run build`、`npm run test:runtime` 通过。后者包含既有运行时、骨骼变形、GPU 查询回归，以及新增建造测试：坐标边界与负坐标、路线排除、扣款与占用、重复提交、暂停、重开与销毁、创建失败不扣款、修改费用/金币/网格生效、7 个非法建造内容案例。

生产 dist 的 `tools/browser/placement-smoke.cjs` 验证实际鼠标及触摸输入：

- 预览/取消、路线拒绝、已建塔选中、重复确认、3 座塔扣款 100 → 70 → 40 → 10、第四座费用不足。
- 暂停冻结、恢复建造、UI 操作不改变地图选择、拖动取消和 Escape。
- 三轮重开后，仅保留一份预览，累计创建数减释放数始终为 1，共享 geometry dispose 为 0。
- 退出建造页、进入原运行时页生成单位，再返回建造页正常。
- 844×390 横屏与 390×844 竖屏，逐个轻触 17 个可建格；所有中心点未被 DOM UI 遮挡，选中坐标正确。
- 触摸拖动、touchcancel、双指均不选格；轻触建造与取消可用。两种布局无横向溢出，确认按钮完整可见且高度至少 44px。

Vite StrictMode 的 `tools/browser/placement-lifecycle-smoke.cjs` 验证：资源延迟返回时退出、三轮页面重进、故意让 arrow.glb 返回 404 后显示加载错误、不创建建造世界，以及用户点击重试后正常加载。这里故意的 404 是失败路径测试，不作为正常资源成功加载的证据。

正常交互回归的页面异常、console error、失败请求为零。生命周期回归无页面异常；故意 404 的浏览器网络错误属于预期测试结果。

T3 preview_status/open 返回无可用浏览器宿主，因此以上使用 Chromium + SwiftShader。触摸事件来自浏览器模拟，截图已查看；不代表真实手机的手指命中率、Safari 兼容性或 GPU 性能验收。P2.3 的实机部分仍待完成，P2.4 独立游戏构建仍未完成。

证据目录：`artifacts/placement/`，包含 `result.json`、`lifecycle-result.json` 和桌面预览、已建塔、横屏、竖屏截图。浏览器复现：

```bash
PLAYWRIGHT_MODULE=/tmp/rab-playwright-runtime/node_modules/playwright-core \
CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
node tools/browser/placement-smoke.cjs

PLAYWRIGHT_MODULE=/tmp/rab-playwright-runtime/node_modules/playwright-core \
CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
PREVIEW_BASE_URL=http://127.0.0.1:5173 \
node tools/browser/placement-lifecycle-smoke.cjs
```

下一实现点是将已放置的箭塔接入索敌、逻辑出箭、箭矢命中与怪物受伤，再串起经济和波次胜负。
