# Blender 操作能力实测

日期：2026-10-01。用户要求实测 Blender 可用操作。本次仅测试工具和资源工作流，未替换游戏模型或修改游戏服务。

## 当前版本：Blender 5.1.2

用户要求升级到 5；磁盘扩容后已安装到持久化目录 `/opt/blender/blender-5.1.2-linux-x64/`，默认命令为 `/usr/local/bin/blender`。重启不会丢失，不再依赖内存盘。5.1.2 是正式版本，本记录不将其称为 LTS。

- build hash：`ec6e62d40fa9`。
- 发行镜像：`https://mirrors.ocf.berkeley.edu/blender/release/Blender5.1/blender-5.1.2-linux-x64.tar.xz`。
- SHA-256 校验通过：`aaccb355f50183979b698bcce7467103a76261b5fa59f4972295842662a285fb`。校验清单保留在 `/opt/blender/manifests/`。
- 复用本项目 probe.py 验证了 CPU 渲染、模型导入、参数修改、动作抽帧、保存工程和 GLB 导出再导入；仍为 41 根骨骼、95 个动作，导出动作名称集合与 4.5 完全一致。
- 能直接打开先前由 4.5.3 保存的 skeleton-probe.blend；读取后仍为 41 根骨骼、95 个动作，记录为 `artifacts/blender5-probe/open-4.5.json`。
- 已修正测试脚本的一处跨版本差异：新建地面材质显式设置 Principled BSDF 的 Base Color，确保 Blender 5 渲染地面颜色正确；材质检查改用 node_tree，避免读取将弃用的 use_nodes 属性。
- 5.1.2 产物位于 `artifacts/blender5-probe/`，其中 editor.png 是实际编辑器截图，其余图片和 report.json 采用与 4.5 相同的命名。
- 这证明本项目当前工作流可升级，不表示任意第三方插件、旧脚本或所有 Blender 文件都兼容。

后续使用：

```bash
blender --version
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python tools/blender/probe.py -- artifacts/blender5-probe
```

GUI 测试仍使用 Xvfb 和 viewport.py，命令中的 Blender 路径换为 `blender`，工程路径换为 `artifacts/blender5-probe/skeleton-probe.blend`。

## 首次验证环境：4.5.3（历史记录）

- Blender **4.5.3 LTS**，Linux x64 官方便携发行包，build hash `67807e1800cc`。
- 下载自发行镜像：`https://mirrors.ocf.berkeley.edu/blender/release/Blender4.5/blender-4.5.3-linux-x64.tar.xz`。
- 对照同镜像发布的 `.sha256` 校验通过：`975c58fcb244273838534bba771e64ad87739216b0f9b39a888531a49a72d845`。
- 本机磁盘测试前仅剩约 250 MB，因此 Blender 解压到 `/dev/shm/d-game1-blender/`，占用内存盘约 1.5 GB（含压缩包）。**重启后该工具目录会消失**；本次未做持久化安装。
- Xvfb 及所需依赖通过 Ubuntu apt 安装，用于真实编辑器窗口；渲染图使用 Cycles CPU，GUI 使用软件 OpenGL。

## 已实际通过的操作

| 操作 | 实测证据 |
| --- | --- |
| 命令行后台运行 Python | 执行 probe.py 正常结束，日志包含 PROBE_COMPLETE |
| 创建基础几何体、相机、灯光与材质 | 创建方块和平面，Cycles CPU 输出 cube.png，已查看 |
| 导入带贴图和骨骼动画的 GLB | 骷髅导入为 10 个 mesh 对象、1 个 armature、41 根骨骼、95 个 actions；贴图 1024×1024，已打包 |
| 修改对象位置与缩放 | 读取原值，将 rig 的 X 平移设为 1、缩放设为 1.25，读回记录后恢复 |
| 修改材质参数 | skeleton 材质 roughness 从 0.5 改为 0.65，读回记录后恢复 |
| 选择动作、跳到指定帧、输出图片 | Idle 第 1 帧、Walking_A 第 5/15 帧、Death_A 末帧，分别渲染且实际查看，姿态符合对应动作 |
| 保存可再次打开的 Blender 工程 | 保存 skeleton-probe.blend，并由 GUI 成功重新打开；这是 GLB 导入形成的工程，不是作者原始制作工程 |
| 导出 GLB 并重新导入 | 导出约 4.15 MiB，含内嵌贴图、1 套 skin 和 95 个动作；新场景重新导入成功，三个指定动作均存在 |
| 打开编辑器、设置材质预览和截图 | Xvfb 中打开实际 Blender 编辑器，显示骷髅贴图与工具界面，ImageGrab 截图已查看 |

Blender 的 mesh 对象数量与 glTF 的 mesh 定义数量口径不同，不据此推断多出或丢失模型。

## 文件与复现命令

- 后台脚本：[tools/blender/probe.py](../../tools/blender/probe.py)。
- 界面设置脚本：[tools/blender/viewport.py](../../tools/blender/viewport.py)。
- 产物目录：`artifacts/blender-probe/`，为可重建的本地产物，已被 gitignore 排除；不进入游戏 dist。
- 结构化记录：`report.json`；后台日志：`run.log`；界面日志：`gui.log`。
- 图片：`cube.png`、`idle.png`、`walk-a.png`、`walk-b.png`、`death.png`、`editor.png`。
- 工程：`skeleton-probe.blend`；测试导出：`skeleton-roundtrip.glb`。

在项目根目录执行后台测试：

```bash
/dev/shm/d-game1-blender/blender-4.5.3-linux-x64/blender \
  --background --factory-startup --threads 4 --python-exit-code 1 \
  --python tools/blender/probe.py -- artifacts/blender-probe
```

界面测试，在两个终端分别运行（显示号空闲时）：

```bash
Xvfb :94 -screen 0 1280x900x24 -nolisten tcp
```

```bash
DISPLAY=:94 LIBGL_ALWAYS_SOFTWARE=1 \
  /dev/shm/d-game1-blender/blender-4.5.3-linux-x64/blender \
  --factory-startup -t 4 -p 0 0 1280 900 \
  artifacts/blender-probe/skeleton-probe.blend \
  --python tools/blender/viewport.py
```

首次启动时需关闭 Quick Setup / 启动画面。本次通过 X11 模拟点击 Continue 并按 Escape 完成。等待材质预览出现后截图：

```python
from PIL import ImageGrab
ImageGrab.grab(xdisplay=':94').save('artifacts/blender-probe/editor.png')
```

界面日志有无 Wayland 会话、无声卡的环境提示，实际 X11 窗口与截图成功。测试结束后关闭本次 GUI 和虚拟显示，不保留常驻渲染进程。

## 能力边界与阶段状态

可以基于上述脚本继续自动化模型检查、参数编辑、动作抽帧、预览图和 GLB 导出。当前素材自带可用骨骼与动作，因此这些操作不需要从零制作动画。

本次没有验证：复杂网格重建、重新绑骨、跨骨骼动作重定向、制作新动作、批量减面/LOD、贴图烘焙或高质量美术生产。CPU 渲染可用不代表有硬件 GPU 加速。

P1.2 的后台调用、Python、图片输出与编辑器截图均通过；P1.3 的导入、动作检查、导出再导入已有初步证据，正式比例/朝向/脚底原点规范及导出文件在浏览器中的复验仍未完成。P1.6 多实例验证和 P2 性能验证未推进。
