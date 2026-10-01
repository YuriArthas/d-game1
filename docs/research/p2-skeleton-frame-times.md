# 骷髅运行时与帧耗时

日期：2026-10-01。续接数据与生命周期探针，增加实际骷髅、帧耗时和模板卸载验证。

同日复审后已拆分逻辑完成与死亡清理、改为每渲染帧推进一次表现，并保留角色内部的共享 skin。以下资源表已更新为本轮重新运行的结果；完整说明见 [调整报告](runtime-review-adjustments.md)。

## 查看

打开 `/#/games/test-game?view=runtime`，选择“50 个单位 · 五条路线”，模型选择“骷髅（骨骼动画）”，点击开始。

- 每帧采样 CPU、更新与渲染提交耗时，以及帧间隔；面板每 250ms 显示最新帧，不是平均值。
- “帧循环 CPU”范围为 R3F 帧回调、固定步逻辑、每帧动画更新、Three.js 渲染提交及计时探针开销；不包括 React/DOM、页面其他脚本或浏览器合成。暂停时仍渲染，所以 CPU 不会归零。
- GPU 使用 `EXT_disjoint_timer_query_webgl2` 异步计时，覆盖场景和阴影渲染命令；显示对应采样帧号，可能落后当前 CPU 帧，不可把两个数字直接相加。
- 最多保留 4 个待完成查询，不使用 gl.finish、忙等或同步读回。计时失效时丢弃结果；不支持扩展时显示“不可用”。上下文丢失后清理查询，恢复后重建计时器。
- 帧间隔包含调度和等待，与 CPU 工作耗时分开显示。窗口切换可能产生很大的帧间隔，游戏仍遵循固定步追赶上限。
- 取消“帧耗时”会关闭采样和 HUD；`SceneRenderer` 继续渲染。常驻诊断只读摘要，展开“数据与释放记录”才遍历实例和采集骨骼详情。

## 骷髅与资源归属

使用现有本地 KayKit 原始 GLB。测试页通过 View 工厂选择球体或骷髅；没有为此次探针提前扩充游戏内容类型或建立资源注册框架。

`SkeletonViews` 持有模板，每个实例用 SkeletonUtils 克隆独立骨骼和 Mixer，再按源 Skeleton 身份恢复实例内的共享 skin 关系；各网格自己的绑定矩阵保持不变。几何体/材质/纹理和只读动作 clip 共享。实例按路线切线转向，Walking_A 循环；逻辑死亡立即失去活动资格，Death_A 单次结束后释放视图，动作结束不决定逻辑死亡或波次完成。全局暂停冻结移动及两种动画。

显式测试显示缩放为 0.42，不改写原始资产；原始 GLB 的正式坐标规范和 Blender 重导出复验仍是独立的 P1 缺口。

重开只清理实例并复用模板；“卸载资源”先销毁世界与所有实例，再释放模板；“重载资源”重新加载。异步加载返回时若页面已经退出，立即释放刚加载的模板。

## 当前证据

- `npm run test:runtime`：既有数据/生命周期回归及 GPU 查询 mock 测试通过，包括不支持、异步结果、4 个查询上限、纳秒换算、disjoint 失效与销毁。
- `npm run build` 通过；既有大 chunk 提示保留。
- `tools/browser/runtime-smoke.cjs`：原有球体 3/50、死亡、重开、布局和退出重进回归通过。
- `tools/browser/skeleton-runtime-smoke.cjs`：3/50 骷髅、不同实例骨骼/首骨 ID、共享 geometry ID、暂停冻结动画、死亡、终点退出、三轮卸载重载、横竖屏与重进通过。pageerror、console error 和失败请求均为零。
- `tools/browser/frame-fallback-smoke.cjs`：在 Vite 开发 StrictMode 环境禁用 GPU 扩展，验证显示“不可用”、CPU 帧数继续更新，以及模型切换、重开、卸载重载、退出重进。
- `tools/browser/frame-render-smoke.cjs`：关闭计时后实际 draw 提交仍增长且 GPU 查询停止；重新开启后恢复取样；上下文丢失后样本清空，恢复后再次取到 GPU 样本；波次完成后死亡清理仍继续。
- 最新生产构建另测 WebGL 上下文丢失/恢复：GPU 查询重建后再次产生结果，骷髅死亡、重开和 CPU 面板继续正常，页面错误为零。截图 `frame-panel-final.png`。
- T3 preview_status/open 明确没有浏览器宿主，以上浏览器检查使用 Chromium 1243 + SwiftShader。GPU 扩展在该软件渲染环境可用，但计时不是物理显卡性能结论。

50 骷髅场景的渲染资源计数：

| 时刻 | 几何体 | 纹理 | 实例 |
| --- | ---: | ---: | ---: |
| 尚未生成 | 6 | 3 | 0 |
| 50 个活动骷髅 | 15 | 54 | 50 |
| 40 活动 + 10 死亡表现 | 15 | 54 | 50 |
| 所有实例已释放，模板保留 | 15 | 4 | 0 |
| 世界与模板全部卸载 | 1 | 3 | 0 |

修正前 50 个骷髅有 450 份骨骼纹理，总纹理数 454；修正后每个角色的 9 个网格共享其原本相同的 skin，骨骼纹理为 50 份，总数 54。实际 GLB 的绑定信息与 29,148 次姿态顶点比较通过，不同角色仍独立；不同源 skin 不合并。几何体共享；销毁单个实例时共享几何体 dispose 为 0，模板卸载才释放 9 个共享几何体。三轮卸载均回到 1 geometry / 3 textures；不据此声称实际帧率、长期 JS 堆内存已验收，也不把骨骼纹理减少等同于 draw call 减少。

证据位于 `artifacts/skeleton-runtime/`：result.json、50-walking.png、death-paused.png、unloaded.png、landscape.png、portrait.png。

复现浏览器：

```bash
PLAYWRIGHT_MODULE=/tmp/rab-playwright-runtime/node_modules/playwright-core \
CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
node tools/browser/skeleton-runtime-smoke.cjs
```

尚未覆盖真实手机 GPU 性能、长时间压力、50 个活动怪物再额外叠加死亡实例、塔/投射物、触摸放置和独立游戏交付。当前节点可供用户验证，不标记 P2 全部完成。
