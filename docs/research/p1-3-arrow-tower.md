# P1.3 箭塔、弓与箭资产验证

日期：2026-10-01。按用户提出的“箭塔＋弓箭”扩展 P1.3 验证样本，使用 Blender 5.1.2 原创生成低多边形资产。

## 交付

| 文件 | 内容 |
| --- | --- |
| `public/assets/arrow-tower/arrow-tower.glb` | 石基木塔、上部转向节点、弓与拉弦动画 |
| `public/assets/arrow-tower/bow.glb` | 可独立复用的弓和拉弦动画 |
| `public/assets/arrow-tower/arrow.glb` | 独立箭矢，包括箭杆、箭头、箭羽及箭尖标记 |
| `assets-source/arrow-tower/arrow-tower.blend` | 可编辑场景，包含展示用灯光、相机与装填姿态的箭 |
| `tools/blender/build_arrow_tower.py` | 完整生成、导出、渲染与重新导入检查脚本 |
| `public/assets/arrow-tower/SOURCE.md` | 来源与运行时资产约定 |

全部几何体和材质由项目脚本生成，没有使用第三方模型或贴图。颜色来自 glTF PBR 材质参数，没有外部贴图依赖。

## 坐标与结构

- 1 单位 = 1 米。Blender 为 Z 向上、-Y 朝前；GLB / Three.js 为 Y 向上、+Z 朝前。
- 塔底占地约 2.2×2.2 米，总高度约 4.11 米；箭长约 1.44 米。本步先固定验证比例，后续地图尺度可另行调整。
- `TowerRoot`：位于地面中心，塔底高度为 0。
- `TurretYaw`：转向中心，Three.js 坐标 `(0, 2.44, 0)`，预留绕 Y 轴旋转。
- `BowRoot`：位于握把中心；独立 bow.glb 的该节点在原点。
- `Muzzle`：箭矢参考点的出生位置。在完整塔的默认朝向下，Three.js 世界坐标为 `(0, 3.12, 0.75)`；将 ArrowRoot 对齐它即可得到准备发射的装填位置。它表示箭的参考点位置，并非箭尖位置。
- `ArrowRoot`：箭矢的移动/旋转参考点，在独立 GLB 原点；`ArrowTip` 位于局部 +Z 方向 0.81 米处。

塔身静止，转向节点供后续运行时控制。弓弦使用 2 根骨骼，其中 StringPull 拉动弦中心，Anchor 固定端点。

## 动作

`Shoot` 时长 **1 秒**，以 30 fps 的第 0～30 帧制作，GLB 动作时间范围检查为 `[0, 1]`：

- 0：准备姿态；
- 11～13：拉满并短暂停留；
- 15，即 0.5 秒：释放；
- 17～21：轻微回弹、复位；
- 30：动作结束。

本步变形对象只有弓弦，弓臂暂保持刚性。展示渲染中的箭随拉弦移动，并在释放后隐藏；GLB 中箭是独立资产，飞行、命中与伤害由后续运行时实现。本步未添加自动寻敌、路线、物理、升级或关卡。

## 验证证据

- 三个 GLB 均由脚本导出后重新导入 Blender；必需节点存在，塔底高度和 Muzzle 坐标断言通过。
- 完整塔和独立弓均保留 Shoot 动作；独立箭不携带骨骼或动作。
- 检查待发、拉满、释放后、俯视四张实际渲染图，确认基本造型、材质与姿态。
- 产物记录在 `artifacts/arrow-tower/report.json`；执行日志在 `build.log`。
- 渲染图：`tower-ready.png`、`tower-drawn.png`、`tower-released.png`、`tower-top.png`。
- 修复了箭羽的重复反向面；重新导入的边界计算仅检查资产根节点层级，排除 Blender 自动创建的隐藏骨骼显示辅助网格。

复现命令，在项目根目录运行：

```bash
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python tools/blender/build_arrow_tower.py
```

本记录对应箭塔样本的资产制作与导出验证。后续 [P1.4](p1-4-browser-static.md) 已完成浏览器静态显示，[P1.5/P1.6](p1-5-6-animation-instances.md) 已完成 Shoot 播放、多实例与基本释放。上部转向、箭矢飞行和 P2 性能尚未实现或验证；骷髅的正式坐标规范仍需收尾。
