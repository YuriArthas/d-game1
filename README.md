# Three.js 游戏测试工程

这是一个最小的 Three.js + React Three Fiber + TypeScript 测试工程，当前已接入网格建造、箭塔攻击与骷髅三波战斗，并保留模型和运行时实验页，不启用物理。

## 开发

```bash
npm ci --ignore-scripts
npm run dev
```

打开 Vite 输出的地址，点击“塔防模型测试”进入游戏。默认“动作与实例”页可选择箭塔或骷髅，对两个实例分别播放、暂停、调整速度、定位动作帧、销毁与创建；也可卸载并重载资源。原有静态资产页和骷髅单实例页保留。入口使用 Hash 路由，以保证 `base: './'` 的静态资源路径在普通 HTTP 服务中可用。

共享资源与独立骨骼/播放状态的验证见 [P1.5/P1.6 记录](docs/research/p1-5-6-animation-instances.md)。

“运行时验证”页提供数据驱动的 3/50 个球体生成、路线移动、暂停、手动死亡和重开实验。直接打开 `/#/games/test-game?view=runtime`，选择场景并点击开始；约 7.3 秒后可看见 50 个活动球体。当前证据与限制见 [数据与生命周期复审](docs/research/p2-2-lifecycle.md)。

运行 `npm run test:runtime` 检查数据校验、生成时间和生命周期，`npm run build` 构建。运行时页现在也可切换骷髅模型，查看独立行走、死亡和卸载重载，以及 CPU/GPU 帧耗时面板；见 [骷髅与计时记录](docs/research/p2-skeleton-frame-times.md)。真实手机性能仍需实机验证。

[运行时调整报告](docs/research/runtime-review-adjustments.md) 记录波次完成与死亡清理分离、每帧动画、按需详情和角色内部骨骼共享。取消“帧耗时”可停止采样，场景继续渲染；展开“数据与释放记录”才采集单位详情。

新增“网格建造”页：直接打开 `/#/games/test-game?view=placement`，点击或轻触浅色格子预览箭塔，再确认建造。初始 100 金币，每塔 30 金币；支持取消、占用/费用判定、暂停和重开。现在可点击“开始波次”：塔会在射程内锁定骷髅、出箭并在命中时扣血，击杀给金币，漏怪扣命；守住全部三波才成功，生命归零则失败。键盘 Escape 可取消预览。详细规则、浏览器触摸验证和边界见 [P2.3 网格建造记录](docs/research/p2-3-grid-placement.md)。`npm run test:runtime` 已包含建造事务、战斗时序、资源失败与实际箭塔 GLB 姿态回归。

先在路线前段和中段各建一座塔再开波，可在战斗中补塔；暂停会冻结单位、动作和飞行中的箭，重新开始恢复 100 金币和 5 点生命。不建塔直接开波可验证失败。展开“战斗详情”才采集目标、位置与资源详情。已提交的单波检查点与复审结果见 [战斗记录](docs/research/single-tower-combat.md)。当前三波玩法在每波结束后保留金币、生命和塔，等待玩家补建并点击“下一波”；面板显示每波结算、后续数量和整局进度。见 [多波玩法记录](docs/research/multi-wave-gameplay.md)。

模型及原始 CC0 授权位于 `public/assets/kaykit-skeletons/`，构建时复制到静态产物，无运行时外部 CDN 依赖。`SkeletonActor` 管理动画与资源生命周期，React 组件只负责场景挂接与测试 UI。

项目生成的箭塔资产位于 `public/assets/arrow-tower/`。`StaticPreviewAsset` 管理静态模型加载、装填挂接和资源释放；正交相机随窗口尺寸调整取景。P1.4 实测见 [浏览器静态显示记录](docs/research/p1-4-browser-static.md)。

## 构建和静态运行

```bash
npm run build
npm run serve
```

然后打开 <http://localhost:4173>。`server/serve.mjs` 只是本地测试服务器，不属于游戏构建产物；真正的游戏入口是构建后的 `dist/index.html`。

## Blender 工具验证

本机当前使用持久化安装的 Blender 5.1.2，可通过 `blender` 命令调用。

```bash
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python tools/blender/probe.py -- artifacts/blender5-probe
```

测试输出在 `artifacts/`，不进入游戏构建。模型导入、动作渲染、GLB 导出及编辑器截图的证据见 [Blender 实测记录](docs/research/blender-probe.md)。
