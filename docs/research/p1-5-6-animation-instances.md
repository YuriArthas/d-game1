# P1.5 / P1.6 动作与独立实例验证

日期：2026-10-01。验证对象为现有箭塔和 KayKit Skeleton_Minion，维持 WebGL2、TypeScript 对象结构和单机范围。

## 用户入口

“塔防模型测试”默认进入“动作与实例”。选择箭塔或骷髅，画面中显示 A、B 两个实例，各自提供播放、暂停/继续、速度、进度、复位、销毁/创建按钮。可卸载当前共享资源，再重新加载。

- 箭塔：Shoot 单次或循环播放，0.5 秒释放。装填箭跟随弦中心，释放后隐藏，复位或下一循环重新装填。
- 骷髅：Idle 和 Walking_A 循环，Death_A 单次播放并停在末帧；死亡后可切回待机或行走。
- 速度支持 0.5×、1×、2×；拖动进度会暂停在对应姿态。
- 箭塔、独立弓、独立箭的静态预览和原有骷髅单实例页仍可访问。

箭的隐藏与重新装填是动作展示，没有加入飞行、命中、伤害、自动寻敌或物理。

## 对象与资源归属

| 对象 | 责任 |
| --- | --- |
| AnimationSession | 下载并拥有一份资源模板，创建/销毁两个实例，最后释放共享资源 |
| AnimationActor | 使用 SkeletonUtils 克隆的独立层级、骨骼和 AnimationMixer；负责动作、时间、暂停、箭矢可见性与实例释放 |
| AnimationLab | React 测试 UI、帧驱动和诊断快照，不实现单位战斗逻辑 |

实例共享 geometry、material、texture 和只读动作 clip；每个实例拥有独立骨骼对象、骨骼纹理与播放状态。单个实例销毁时解绑 Mixer 并释放自己的骨骼资源，不释放共享模型资源。整个 Session 卸载或页面退出时先销毁实例，再由 Session 释放模板资源。销毁操作可重复调用。

## 浏览器验收

通过本机生产 dist，使用无头 Chromium 1243 + SwiftShader。T3 preview_status / preview_open 均报告无自动化浏览器。此处证明模型与动作行为，不作为硬件性能结论。

P1.5：

- 查看准备、拉满、释放、动作结束截图，箭塔姿态符合 Blender 样本。
- Shoot 播放一次后 time=1、finished 事件一次，保持结束姿态；重新播放从头开始。
- 循环 Shoot 可跨多个周期；A 暂停时 B 继续推进。
- 0.5× 和 2× 的动作时间增量分别对应动画时钟增量的 0.5 倍与 2 倍；用动画时钟校验，避免 UI 刷新与软件渲染帧率影响测量。
- 骷髅 A 行走时 B 可死亡并停帧；死亡结束后能切回 Idle。动作切换停止旧 action。
- 进度滑条定位后保持姿态；受控输入立即刷新，避免回写旧帧。

P1.6：

- 实例 root、骨骼对象 ID 不同，而 geometry/material ID 相同；同时验证了独立姿态和不同播放进度。
- 销毁箭塔 A 后，B 的时钟继续推进，共享资源 dispose 事件计数仍为零。
- 重新创建 A 得到新的实例与骨骼，B 的实例身份保持不变；新 A 可正常播放。
- 骷髅实例同样完成销毁/重建；另一实例的死亡姿态不被改写，随后可恢复待机。
- 箭塔完整卸载时，实例创建/销毁数平衡，共享资源释放数与持有数一致：55 个 geometry、11 个 material，无外部 texture。
- 骷髅做了三轮完整卸载/重载。每轮共享资源均准确释放 9 个 geometry、2 个 material、1 个 texture；实例骨骼资源另外独立释放。卸载后的 renderer.info.memory 均回到 1 geometry / 3 textures 的测试场景基线。
- 返回游戏列表后重新进入，加载与播放正常。

桌面、844×390 横屏及 390×844 竖屏均查看实际截图。横屏控制区可滚动；竖屏使用可收缩的网格列，避免画布与第二个实例溢出视口。

## 复现与产物

```bash
npm run build
PLAYWRIGHT_MODULE=/tmp/rab-playwright-runtime/node_modules/playwright-core \
CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
node tools/browser/p1-5-6-smoke.cjs
```

脚本：[tools/browser/p1-5-6-smoke.cjs](../../tools/browser/p1-5-6-smoke.cjs)。结果在 `artifacts/p1-5-6/result.json`，包含姿态、实例 ID、共享资源 ID、时间与释放事件记录。该诊断通过测试页的 data 属性暴露，不写入游戏存档或发送网络。

同目录包含 `walkthrough.webm` 录像和关键截图：tower-drawn、tower-released、tower-finished、tower-only-b、skeleton-walk-and-death、skeleton-recreated、landscape、portrait。

构建和正常浏览器流程没有页面异常、加载失败或着色器错误。既有 Three.Clock 弃用提示和构建的大 chunk 提示保留，本步不做无关优化。

## 阶段结论

P1.5 和 P1.6 在上述两个样本上通过。三轮资源计数复原是基本生命周期证据，不等于长时间堆内存、同屏 50 个怪物或真实手机性能验收；这些仍属于 P2。本次没有推进关卡、波次或战斗系统。

P1 整体仍需收尾核对原有骷髅的正式坐标规范与重导出文件的浏览器复验，不把本次通过扩大为 P1 所有历史缺口都已解决。
