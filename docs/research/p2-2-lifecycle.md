# 数据与生命周期复审及可验证节点

日期：2026-10-01。当前是 P2 占位球体探针，P2.2 尚未整体验收。

## 用户入口

[打开验证页](https://w-sunjun-user.dev.clock-p.com/#/games/test-game?view=runtime)，公网入口需经现有飞书网关登录。本地入口为 `http://localhost:4173/#/games/test-game?view=runtime`。

1. 选择“50 个单位 · 五条路线”，点击“开始 / 继续”。每条路线生成 10 个单位，间隔 0.8 秒；约 7.3 秒后共 50 个活动单位。
2. 暂停，点击“击杀 10 个”：活跃数立刻减少，死亡表现数增加；暂停期间球体保持原位并变红。
3. 继续：死亡球体缩小，0.8 秒后释放；剩余单位抵达终点后释放。
4. 重新开始：清空本轮单位，待生成数恢复到 50。展开“数据与释放记录”可检查配置和累计创建/释放。
5. 切换三单位场景、返回列表后重进，检查行为仍正常。

## 认真复审后的修正

- 删除未使用的可选模型、行为和塔 ID 字段，保留六类最小定义；数据只读，不含 Three.js 对象。
- 修复只读取第一条生成项、忽略间隔、按颜色数量截断单位数的问题。全部生成项按时间并行执行，路线按 entry.routeId 绑定。页面明确选择一个波次，不隐式跳过其他波次。
- 修复 React StrictMode 中 useMemo 创建资源但 effect 清理后复用已销毁世界的问题。每次 effect setup 拥有新的世界，cleanup 对称释放。
- 校验 NaN/Infinity、非正速度、非整数生成数量、空关卡/波次、重复 ID、缺失引用、跨地图路线和零长度线段。
- 替换可变帧步为 1/60 秒固定步；后台恢复单帧最多追赶 0.25 秒。
- 逻辑死亡与视图释放分开：死亡立即移出活动资格，视图播放简单缩小表现后释放；抵达终点直接释放。释放后从容器删除，不保留全部历史单位。
- 销毁可重复调用；已销毁世界不能重开。重开清空剩余单位和生成进度。新增多轮累计创建/释放计数。

## 验证

`npm run test:runtime` 包含 12 个非法数据案例，以及全部生成项、零间隔批量生成、配置改动生效、暂停、死亡、释放、多轮重开、销毁幂等和固定步分帧一致性检查。

`npm run build` 通过。生产 dist 浏览器脚本：

```bash
PLAYWRIGHT_MODULE=/tmp/rab-playwright-runtime/node_modules/playwright-core \
CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
node tools/browser/runtime-smoke.cjs
```

T3 preview_status/open 明确报告无浏览器宿主，因此使用 Chromium 1243 + SwiftShader。浏览器检查覆盖：

- 三单位按间隔生成、暂停冻结、重开；
- 50 个球体分布在五条路线；
- 暂停中击杀 10 个，40 个保持活动，10 个逻辑死亡且保留视图；继续后释放死亡视图；
- 剩余 40 个抵达，全部释放后单位容器为零；几何体从 56 降到 6（地面和五条路线）；
- 三轮在运行中重开，累计创建与释放相等，几何体回到 6；
- 844×390 横屏、390×844 竖屏布局截图及无横向溢出；
- 返回列表并重进后正常生成；页面异常、console error 和失败请求为零。

另外在 Vite 开发环境开启 StrictMode，验证了生成、重开、场景切换和退出重进。

证据目录：`artifacts/runtime-review/`，包含 `result.json`、`50-active.png`、`death-paused.png`、`released.png`、`landscape.png`、`portrait.png`。截图需实际查看；计数断言不代替画面检查。

## 边界

本页是球体阶段的历史证据。后续骷髅同屏/死亡动画和 CPU/GPU 计时已验证，见 [骷髅运行时与帧耗时](p2-skeleton-frame-times.md)。长期堆内存和手机 GPU 性能仍未验收。当前塔与投射物均为 0。生命上限用于单位初始 health 和手动击杀；reward、startingGold、baseLives 仅做数据校验，尚未接经济、基地扣血、波次奖励、胜负或自动多波推进。P1 的骷髅坐标规范和重导出浏览器复验缺口仍在。

公网只检查到现有 OAuth 重定向；自动化验收使用本地 dist，不声称公网登录后的用户端验收已经完成。构建现有的大 chunk 提示保留。
