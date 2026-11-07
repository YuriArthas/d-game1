# 蓝银骑兵 Web 动作样本

本项目原创网格、骨骼和动作，由 `tools/blender/build_cavalry.py` 在 Blender 5.1.2 中生成。造型参考本会话用户选定的第一张低多边形骑士三视图；未使用第三方模型、动作或贴图。概念图只是美术参考，没有自动转换成网格。

- 范围：普通长枪骑兵的 Web 造型、五个动作、上下身分层和拖拽旋转预览。
- 实测：骑手、马、长枪、盾牌和马具合计 **2078 三角面**，27 根骨骼，1 套 skin，1 个材质；长枪从握点到枪尖约 3.0 m。
- 贴图：一张 **256×256 PNG 调色板**，内嵌到 GLB；同目录保留 PNG。没有高分辨率贴图依赖。
- 坐标：米；Blender Z 向上、-Y 朝前；glTF/Three.js Y 向上、+Z 朝前。
- `CavalryRoot` 不随动作平移；当前原地播放。
- 源文件：`assets-source/cavalry/cavalry.blend`，内含网格、可编辑骨架、五个 Actions、打包贴图和展示相机/灯光。
- Tripo 评审变体：`cavalry-tripo.glb` / `assets-source/cavalry/cavalry-tripo.blend`，直接使用原始蓝银低多边形三视图 `output/imagegen/cavalry-lowpoly/001-...png`，由 RAB 同款 `multiview_to_model` API 重新生成，face limit 5000；原始 mesh 输出 4881 面，随后以同一 mesh task 调用 `texture_model`，删除持剑侧重复盾牌、加入颈甲桥并绑定后的变体为 **4766 三角面**，使用一张 **512×512 Tripo 烘焙 PNG**。仍复用同一 27 根骨骼和五个动作。Tripo 原始输出没有骨骼，当前绑定是四近邻距离权重种子加盾牌刚性修正，马腿、骑手髋部、盾牌和武器进入 Roblox 前仍应在 Blender 中逐处检查并手刷。
- 说明：该原始概念图的手持武器是短剑，Tripo 变体忠实保留了它；`cavalry.glb` 回退资产仍是旧的长枪版本。若最终必须使用长枪，需要换成带长枪的四视图后重新跑 mesh task，单独的 texture_model 任务不会改变几何。

| 动作 | 时长 | 规则 |
| --- | ---: | --- |
| Idle | 2.2 s | 循环，轻微呼吸、马头和马尾动作 |
| Run | 0.9 s | 循环，四拍马步的支撑、抬腿、落地和骑手随动 |
| Attack | 1.0 s | 上身长枪水平后收、沿前进轴穿刺、收回；可叠加 Idle/Run |
| Charge | 0.7 s | 全身循环，较大的步幅、骑手前倾与盾牌前送 |
| Dead | 1.8 s | 全身一次，马失衡停止、骑手侧向摔落；末段定格 |

`RiderSpine` 子树属于上身遮罩；`HorseBody`、全部马骨骼、`RiderPelvis` 和骑手双腿属于基础层。Charge 和 Dead 清除上身层。马腿 IK 和死亡接地在制作阶段求解、烘焙为关键帧，不依赖运行时 IK 或布娃娃。Attack 的枪尖前刺时间参考为 0.57 s，本样本不执行伤害判定。

`CavalryRoot.motion_bounds` 保存五个动作的 glTF 局部取景范围，用于相机保持动作可见。它不是碰撞体或游戏判定范围。

重建：

```bash
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python tools/blender/build_cavalry.py
npm run test:runtime
npm run build
```

当前没有 Roblox 导入/运行验收、战斗逻辑、根运动、换装、LOD 或真实手机性能结论。先在 Web 查看造型与动作，按用户视觉反馈修订，再讨论迁移。
