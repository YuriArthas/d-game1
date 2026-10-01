# Three.js 游戏测试工程

这是一个最小的 Three.js + React Three Fiber + TypeScript 测试工程，当前验证箭塔与弓箭的静态显示，以及 KayKit 骷髅的骨骼动画，不启用物理。

## 开发

```bash
npm ci --ignore-scripts
npm run dev
```

打开 Vite 输出的地址，点击“塔防模型测试”进入游戏。默认“动作与实例”页可选择箭塔或骷髅，对两个实例分别播放、暂停、调整速度、定位动作帧、销毁与创建；也可卸载并重载资源。原有静态资产页和骷髅单实例页保留。入口使用 Hash 路由，以保证 `base: './'` 的静态资源路径在普通 HTTP 服务中可用。

共享资源与独立骨骼/播放状态的验证见 [P1.5/P1.6 记录](docs/research/p1-5-6-animation-instances.md)。

“运行时验证”页提供 P2.1 的最小路线推进、暂停和重新开始实验，记录见 [P2.1 记录](docs/research/p2-1-runtime.md)。

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
