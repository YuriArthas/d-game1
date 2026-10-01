# KayKit 浏览器接入实测

日期：2026-10-01。用户在 P1.1 后选用 KayKit Skeletons，要求直接放入游戏试跑。本次复用原始 GLB，不执行 Blender 安装或重导出，也不增加塔防玩法。

## 接入内容

- 保留一个游戏列表入口，测试游戏改为平地上的 Skeleton_Minion。
- 本地模型、原始 CC0 授权和固定版本来源位于 `public/assets/kaykit-skeletons/`，完整进入 `dist`。
- `SkeletonActor.ts` 管理 GLTF 加载、AnimationMixer、动作切换和实例资源释放；React 负责 UI 与帧更新。
- 待机使用 Idle，行走使用 Walking_A，循环播放；死亡使用 Death_A，只播放一次并停在末帧。重复点击可重播，切回待机可恢复。
- 没有路线移动、物理、攻击、关卡或多实例系统。现有 Rapier 依赖暂保留，但本场景不导入、不运行物理。

## 实测与证据

- `npm ci --ignore-scripts`、`npm run build` 通过。
- 使用 systemd 服务提供的生产 `dist`，浏览器从列表点击进入游戏。
- T3 协作浏览器 status/open 均明确报告环境无可用浏览器，因此使用本机 Playwright 驱动无头 Chromium 1243 + SwiftShader。
- WebGL 上下文实测为 WebGL 2.0，渲染器为 ANGLE / SwiftShader。
- 最终浏览器记录：pageerror / console error 为 0，失败请求为 0；没有着色器编译错误。仅记录到 R3F 使用 Three.Clock 的弃用提示。
- 实际查看待机、行走与死亡截图：模型、贴图和阴影可见；两张行走帧的角色姿态不同；死亡后两张间隔截图像素一致，符合末帧停留。
- 检查死亡重播、恢复待机以及返回列表后重新进入。
- 桌面 1280×800；横屏 844×390、竖屏 390×844 做布局检查。横屏控制面板移到右侧，避免遮住模型。
- 截图、录像及诊断记录保存在 `/tmp/d-game1-skeleton-evidence/`；脚本 `smoke.cjs`，日志 `result.json`。临时路径不作为交付资源。

## 服务与限制

- `d-game1-test-server.service` 和 `d-game1-clockbridge.service` 均运行中；静态服务直接读取本次重新构建的 dist。
- 公网入口：`https://w-sunjun-user.dev.clock-p.com/#/games/test-game`。无登录态访问会被网关重定向到飞书 OAuth；本次视觉验证使用 `http://127.0.0.1:4173/`，不声称已通过公网登录后的端到端验收。
- 单模型跑通不代表同屏 50 个怪物或真实手机性能通过；浏览器视口缩放不是手机设备验收。
- P1.2/P1.3 的 Blender 工作流、P1.6 多实例隔离及长期资源释放验证仍待执行。
- 构建存在 JS chunk 大小提示，R3F 内部调用 Three.Clock 会产生弃用提示；本次不展开依赖升级或性能优化。
