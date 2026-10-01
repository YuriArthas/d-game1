# P1.1 模型与动作库调查

调查日期：2026-10-01。范围仅为资源调查、样本下载和文件元数据核验。

## 结论

推荐 **KayKit Skeletons 1.0 / Skeleton_Minion.glb** 作为 P1 技术验证样本：免费、CC0、单文件携带模型/骨骼/贴图/动作，已实际确认待机、移动、死亡动作条目存在，无需先接入外部动作库。

**Quaternius Ultimate Monsters** 是后续扩展约 20 种不同外形怪物的优先候选；已抽查一个模型，确认移动和死亡动作条目。第一轮技术样本选型不等于确定整款游戏的美术方向。

P1.1 调查与推荐完成；P1.2～P1.6 尚未执行。没有购买资源、安装 Blender、接入游戏或修改运行服务。

## 候选比较

价格为调查时页面标价，美元。包内数量来自官方说明，不表示已逐个下载核验。

| 候选 | 风格与数量 | 移动、死亡与骨骼 | 格式 | 费用与授权 | 本项目判断 |
| --- | --- | --- | --- | --- | --- |
| [KayKit Skeletons](https://kaylousberg.itch.io/kaykit-skeletons) + [Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) | 风格化低多边形骷髅；当前 1.1 免费 4 个角色，Extra 加 2 个；武器配件 10+ | 旧版 1.0 样本实际含 Idle / Walking_A / Death_A，1 套骨骼、41 joints。当前角色包官方称兼容独立动作库；动作库有 Rig_Medium / Rig_Large，161 个人形动作，Large 数量较少 | FBX、glTF；旧版样本为 GLB；作者 .blend 为付费 Source | 模型与动作免费版本均 CC0；角色 Extra $7.95、Source $11.95；动作 Source $14.99 | 最适合先验证完整流程。4 个免费角色不能算作 20 个独立外形；新旧版本兼容性不能混同 |
| [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | 鲜艳卡通、怪物轮廓多样；官方 50 个，分 Big / Blob / Flying 等目录 | 官方称全部带动画；实查 Alien：Walk / Run / Death 等 14 个动作，CharacterArmature、43 joints。未证明其余模型动作一致或可共用骨骼 | 官方列 FBX、OBJ、Blend、glTF；实查 .gltf | 免费；该包官方页面明确 CC0 | 数量和外形更适合扩充怪物阵容，但需逐个检查所选 20 个的动作与风格；OBJ 不适合作为骨骼动画交付格式 |
| [Quaternius Bestiary Dungeon Monsters Kit](https://quaternius.itch.io/bestiary-dungeon-monsters-kit) | 低多边形地牢敌人；官方整包 7 种，每种 3 个颜色版本 | 人形骨骼，官方称兼容 Universal Animation Library；商店明确不附带动画，需另外取得并适配 | 商店说明 FBX、GLB；Source 含 .blend | Standard 免费，Source $20；QAL，非 CC0。免费版具体模型覆盖未核验 | 暂不推荐作为首个样本：多出动作适配环节，7×3 配色也不等于 21 种独立怪物 |

Bestiary 官网页头虽然标注 Animated，但商店正文明确写着 “This kit doesn't include any animations”，本次以该明确说明为准。KayKit 的 161 个动作是独立动作库的页面数量，不是旧版样本内的动作数量。

## 推荐样本：固定版本与实际证据

- 作者仓库：[KayKit-Character-Pack-Skeletons-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)。
- 固定提交：`15b62b9bad122f72926c10fb14d622c73819fa54`。
- 文件：`addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Minion.glb`。
- [固定版本下载](https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/15b62b9bad122f72926c10fb14d622c73819fa54/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Minion.glb)。
- [同版本授权文件](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/blob/15b62b9bad122f72926c10fb14d622c73819fa54/LICENSE.txt)，本次已读取，明确 CC0、允许商业使用、署名可选。

实际解析 GLB 的 JSON chunk，得到：

| 项目 | 实查结果 |
| --- | --- |
| 文件大小 | 4,814,296 bytes，约 4.59 MiB |
| SHA-256 | `6ffc003f895bed0b074791e0e490846210a2e2f8fc7da300aba53cc185f95968` |
| 格式 | glTF 2.0 二进制 GLB |
| 网格 | 9 个 mesh 定义；不等于已测 draw calls |
| 骨骼 | 1 个 skin，名称 Rig，41 joints |
| 贴图 | 内嵌 PNG，名称 skeleton_texture |
| 动作 | 95 个 animation 条目 |
| 待验证的语义映射 | idle → Idle；walk → Walking_A；death → Death_A |
| 其他可选动作 | Walking_D_Skeletons、Death_C_Skeletons 等骷髅专用动作 |

选择旧版 1.0 是为了得到公开、可固定版本且动作已内置的验证样本。当前商店是 1.1，不能将本次旧文件核验写成 1.1 已通过，也不预设旧版骨骼兼容新版独立动作库。

免费 GLB 可以作为后续 Blender 导入检查的输入；这不等于拿到了作者原始 .blend 控制器和完整制作工程。若后续需要作者工程，再评估 Source 版本。

## 第二候选的文件级抽查

从官方页面链接的[公开下载目录](https://drive.google.com/drive/folders/18m4KpzpEzhC9wl7jzr6dUc0N8Jozr79C)，进入 `Big/glTF` 下载 `Alien.gltf`。

- [样本文件](https://drive.google.com/file/d/1rWF4Jo_G7-odDa5LfkQ0e2d9_p9pxb3W/view)：1,295,881 bytes，约 1.24 MiB。
- 1 个 mesh，1 个 skin：CharacterArmature，43 joints；内嵌 PNG Atlas_Monsters。
- 14 个动作：Death、Duck、HitReact、Idle、Jump、Jump_Idle、Jump_Land、No、Punch、Run、Walk、Wave、Weapon、Yes。
- 已查看官方角色总览图，外形包含人形、飞行和团状怪物；这是资源宣传图观察，不是浏览器或俯视玩法验收。
- 该包 CC0 依据为包专属官方页面；下载目录中的 License.txt 本次网络读取失败，尚未核对包内文本。正式采用时保留并复核随包授权。

两个样本的大小受内置动作数量等因素影响，不据此推断移动端性能优劣。

## 授权与交付

本项目需交付静态站点、本地资源及可编辑工程，因此同时考虑商业使用、修改、站点分发和源素材交付。

- **KayKit 样本：**已读固定版本 LICENSE.txt，采用 [CC0](https://creativecommons.org/publicdomain/zero/1.0/)，允许复制、修改、分发和商业使用，适合随项目交付源素材。仍保留作者、来源、版本和授权记录。
- **Ultimate Monsters：**该旧包页面明确 CC0。不要用 Quaternius 当前通用许可页覆盖旧包的明确许可，也不要把旧包的 CC0 推广到其所有新资源。
- **Bestiary：**采用 [QAL v1.0](https://quaternius.com/license.html)，页面更新日期 2026-08-28。允许商业产品使用和修改、分发包含资源的成品、授权协作者为该产品工作；禁止把素材本身作为独立素材、素材包或模板再分发。甲方源工程交付需要结合授权主体及协作关系确认，不能仅凭“可商用”判断原始素材任意转交均可。

本次未采购任何收费版本。KayKit 页面关于不要转售未修改副本的作者请求也已记录；本项目用途是游戏及其工程交付。

## 扩展到约 20 种怪物的缺口

- 如果目标是 20 种玩法定义，少量模型配合装备、体型和技能可以复用，但要保证俯视下可辨识；当前未进行这种制作。
- 如果要求 20 个不同轮廓的模型，KayKit Skeletons 单包不足；Ultimate Monsters 的官方数量足够形成候选池，但仍需逐个核查所选角色的动作与质量。
- 换色不算不同外形；不预设不同作者的包能直接混搭出统一美术。
- 独立动作库并非任意模型即插即用：骨骼、绑定姿态、比例和轨道目标仍需验证，必要时重定向。

## 本步证明与后续边界

本步已完成三套资源对比、两份真实模型文件的元数据核验、推荐样本的版本固定和授权读取。

**尚未证明：**动作实际播放正确、是否原地移动、死亡末帧处理、比例/朝向/脚底原点、Three.js 材质效果、多实例隔离、同屏 50 个怪物性能及真实手机表现。动作名称存在不代表这些项目已通过。

下载文件只用于本次临时检查，位于 `/tmp/d-game1-p11/`；没有加入游戏资源目录。后续可按固定地址和 SHA-256 重新取得推荐样本。

下一步按计划为 P1.2：单独验证 Blender 调用与图片输出。本次不提前执行。
