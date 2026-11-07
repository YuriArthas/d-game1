# Three.js 游戏测试工程

这是一个最小的 Three.js + React Three Fiber + TypeScript 测试工程，当前已接入网格建造、箭塔攻击与骷髅三波战斗，并保留模型和运行时实验页；另有独立骑兵动作测试，不启用物理。

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

新增五个 Blender 原创样本：骨甲爬虫、疾行小鬼、岩甲巨怪、炮塔和冰霜塔。打开 `/#/games/test-game?view=animation&asset=bone-crawler`，在“验证模型”下拉框选择；可分别控制两个实例的动作、暂停、进度和释放。三个怪物都有 Idle / Walk / Death，炮塔有 Shoot，冰霜塔有 Idle / Shoot。疾行小鬼还增加了 UpperAttack：选择“行走”后点击“上身攻击”，可分别控制上下身速度、暂停与进度，调节上身权重；死亡切回全身动作。直接打开 `/#/games/test-game?view=animation&asset=moss-runner`，详见[分层动作记录](docs/research/split-body-animation.md)。GLB 在 `public/assets/frontier/`，可编辑 `.blend` 在 `assets-source/frontier/`，生成脚本为 `tools/blender/build_frontier.py`。它们目前是模型与动作样本，尚未接入战斗数值或规则，详见[原创模型记录](docs/research/frontier-assets.md)。

新增独立“骑兵动作测试”入口：直接打开 `/#/games/cavalry`。页面默认展示约 5000 面的 Tripo 蓝银骑兵（4766 三角面、512×512 Tripo 烘焙贴图、一个材质），旧 2078 面长枪版本保留为回退资产。可查看 Idle / Run / Attack / Charge / Dead，奔跑可叠加上身前向穿刺，马腿采用四拍支撑/抬腿节奏，左右实例独立；画布支持鼠标拖动或触摸左右滑动旋转角色，也保留四个观察角度、分层暂停与进度、卸载/重载。该测试不接塔防，先接受 Web 视觉反馈再考虑 Roblox。源文件在 `assets-source/cavalry/`，详见[骑兵动作记录](docs/research/cavalry-web-animation.md)。

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

## Block Blast 竖屏游戏

游戏列表新增 Block Blast，静态入口为 `games/block-blast/index.html`，源码位于同级 `../d-Block-Blast`。宿主及子游戏使用 Node.js **24.x**。两个工程各执行一次 `npm ci --ignore-scripts`，之后宿主的 `npm run build` 会先构建 Block Blast，再构建宿主并复制完整子游戏产物。若源码不在默认路径，设置 `BLOCK_BLAST_PROJECT` 为其目录；源码或依赖缺失时构建明确失败。

构建完成后 `npm run serve` 在 4173 提供完整静态站点。Block Blast 支持刷新、暂停菜单返回列表，调试入口添加 `?debug=1`。子游戏可以独立构建部署，无需加载塔防资源。游戏规则、确定性 API、回放和验证记录见 [Block Blast README](../d-Block-Blast/README.md)。

当前站点已切到公开入口 <https://w-sunjun-public.dev.clock-p.com/>，无需登录；Block Blast 直达 <https://w-sunjun-public.dev.clock-p.com/games/block-blast/index.html>。

## Mining 正式版与公开测试版

游戏列表并列提供：

- 正式 Mining：<https://w-sunjun-public.dev.clock-p.com/games/mining/index.html>
- Mining 测试版：<https://w-sunjun-public.dev.clock-p.com/games/mining-test/index.html>

Mining 可试玩改动先发布到测试入口，再进行公开场景/交互验证，不能只做用户看不到的本地预览。需要额外隔离时增加公开列表入口。测试版退出后返回游戏列表。

宿主构建使用 `MINING_TEST_PROJECT`（兼容旧 `MINING_PROJECT`，默认 `../d-Mining`）构建测试版。正式 Mining 从 `MINING_RELEASE_DIST` 指定的已发布构建复制，默认保留当前 `dist/games/mining`；不会自动将测试源码提升为正式版。正式构建缺失会明确失败。

`GAME_BUILD_OUT_DIR` 可指定构建产物目录；构建前暂存子游戏产物以保留正式 Mining。公开部署只替换所需入口，保留旧哈希资源。不要为修改游戏列表而覆盖其他游戏或未授权的正式版本。
