# Tripo 骑兵评审变体

日期：2026-10-02。

## 生成

使用 RAB `asset-order-server` 已验证的 Tripo HTTP 合约：将 Blender 渲染的正面、左侧、背面、右侧四张 512×512 PNG 上传到 `/upload/sts`，创建：

```json
{
  "type": "multiview_to_model",
  "model_version": "P1-20260311",
  "face_limit": 5000,
  "texture": false,
  "pbr": false,
  "export_uv": true
}
```

任务 `0d0ce66c-e14f-4977-a0ca-7ec2144f5478` 成功完成。输入是 `output/imagegen/cavalry-lowpoly/001-a-stylized-low-poly-3d-game-character-concept-sheet-for-a-mo.png` 的原始三视图裁切，没有读取旧 Blender 网格。下载的原始 GLB 为一个无骨骼 mesh，实测 4881 三角面。原始输入、任务产物和脚本在 `artifacts/cavalry/tripo/original-lowpoly-002/` 与 `tools/tripo/generate_cavalry.mjs`；此前的 `f02c...` 任务保留为对照。

随后复用新 mesh task 创建 Tripo `texture_model` 任务 `ee1c036a-8760-498c-8617-ce676ef01df0`，使用相同四视图、`texture_alignment=original_image`、`bake=true` 和 `texture_quality=standard`。纹理任务输出为 2048×2048 JPEG；绑定导出阶段缩到 512×512 PNG，仍是 Tripo 烘焙纹理，不再使用本地调色板。

## Blender 绑定

`tools/blender/rig_tripo_cavalry.py` 导入 Tripo textured GLB，按 Tripo 输出方向旋转和缩放到原骑兵尺寸，补一个低面数颈甲桥，保留 Tripo 材质和 UV，缩到 512 贴图，复用现有 27 根骨骼和五个动作，生成四近邻距离权重并导出 `public/assets/cavalry/cavalry-tripo.glb`。当前变体有一套 skin、一个 mesh、一个 material，以及 Idle / Run / Attack / Charge / Dead 五个动作。

四近邻权重是可播放的起点，不是最终美术权重。新 mesh 任务仍生成了一个附着在持剑侧的重复盾牌壳体；绑定脚本按断开的 Tripo 组件删除该重复壳体，并将保留盾牌刚性映射到 `RiderForeL`。进入 Roblox 前仍应在 Blender 的 Weight Paint 中检查马腿、骑手髋部、盾牌和武器。

## 当前验证

- 原始 Tripo mesh GLB：4881 三角面；Tripo texture_model 仍为 4881 三角面；删除重复盾牌、加入颈甲桥后的绑定变体：4766 三角面、27 根骨骼、1 skin、1 material、512×512 内嵌 PNG（Tripo 烘焙内容）。
- 绑定变体保留五个动作，Attack 使用现有水平向前穿刺、停顿、回撤曲线。
- 当前原始四视图中的手持武器是短剑，因此 Tripo 变体仍是短剑；长枪只存在于旧的 `cavalry.glb` 回退资产。若要让 Tripo 几何本身成为长枪，必须替换参考四视图并重新生成 mesh。
- `npm run test:runtime` 和 `npm run build` 通过；页面默认加载 `cavalry-tripo.glb`，原 2078 面 `cavalry.glb` 仍作为回退基线保留。
- 页面验证只证明 GLTF 播放和浏览器预览；还没有 Roblox 导入、真实移动端 GPU 性能或最终手刷权重验收。
