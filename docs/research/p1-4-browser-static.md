# P1.4 浏览器静态显示

日期：2026-10-01。本步接入 P1.3 导出的箭塔、弓、箭，验证 Three.js WebGL2 / R3F 中的静态显示。

## 当前行为

- 同一个游戏列表入口更名为“塔防模型测试”，进入后默认显示完整箭塔。
- 箭塔已有弓，独立 arrow.glb 挂到导出模型的 Muzzle 节点，得到装填姿态。
- 可切换独立弓、独立箭和原有骷髅测试。
- 箭塔与弓箭保持静态，不播放 Shoot；本步不增加转向、发射、伤害或波次。
- 模型保持原始单位和缩放。完整塔直接落在 Y=0；独立弓、箭保留各自资产原点，通过预览容器平移，使包围盒底面与地面相接。
- 正交相机采用俯视角，按模型包围盒及窗口宽高取景。切换资产时，取景缩放会变化，不能通过不同标签截图的像素尺寸比较资产实际大小。

## 实测结果

- `npm run build` 通过，当前 systemd 静态服务已提供新 dist。
- 从列表进入、三个静态模型切换、返回列表再进入均成功。
- 实际查看桌面 1280×800、横屏 844×390、竖屏 390×844 截图：模型完整，材质颜色与组成可辨认，底座落地，UI 不遮挡模型，无横向溢出。
- Three.js 读取的塔底高度约为 0，最高点约 4.11023；Muzzle 和装填 ArrowRoot 世界坐标一致，约为 `(0, 3.12, 0.75)`。
- 两张间隔采集的箭塔截图像素一致，确认当前为静态显示；dist 中三个 GLB 的 SHA-256 与 P1.3 源资产一致。
- 骷髅模型仍能载入并切换行走，已有动画测试入口保留。
- 正常加载阶段未发现页面异常、console error、请求失败或 HTTP 错误；没有着色器编译错误。R3F 使用 Three.Clock 的既有弃用提示单独记录。
- 故意模拟 bow.glb 返回 404，页面明确显示加载失败；恢复后切回箭塔可正常加载。该预期 404 的诊断与正常加载诊断分开记录。

## 证据与复现

T3 preview_status 和 preview_open 均明确报告没有可用自动化浏览器，因此本次通过本机 Playwright 驱动无头 Chromium 1243，实测上下文为 WebGL 2.0 / ANGLE SwiftShader。

脚本：[tools/browser/p1-4-smoke.cjs](../../tools/browser/p1-4-smoke.cjs)。Playwright 工具来自现有外部测试环境，没有加入游戏依赖。

```bash
PLAYWRIGHT_MODULE=/tmp/rab-playwright-runtime/node_modules/playwright-core \
CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
node tools/browser/p1-4-smoke.cjs
```

测试默认访问 `http://127.0.0.1:4173/`，可通过 PREVIEW_BASE_URL 指定其他入口。

证据在 `artifacts/p1-4/`：

- `tower-desktop.png`、`bow-desktop.png`、`arrow-desktop.png`：三个静态模型。
- `tower-landscape.png`、`tower-portrait.png`：小屏幕布局。
- `skeleton-regression.png`：原有骷髅测试回归。
- `result.json`：模型边界、挂点位置、渲染器和诊断结果。

公网入口仍为 `https://w-sunjun-user.dev.clock-p.com/#/games/test-game`。测试服务和 bridge 均 active；本次未登录的公网请求返回 302 身份验证跳转，视觉证据来自本地生产静态服务，不是公网登录后的端到端验收。

## 阶段出口

P1.4 箭塔样本的浏览器静态显示通过。后续 [P1.5/P1.6](p1-5-6-animation-instances.md) 已完成 Shoot 播放和多实例基本释放验证。P2 设备性能仍待执行；小屏视口和 SwiftShader 截图不代表真实手机 GPU 验收。构建有既有的大 JS chunk 提示，本步不做打包优化。
