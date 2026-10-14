# 第三方来源与许可

本页记录当前仓库的来源、已保留通知和公开发布前待确认事项。项目整体许可证尚未确定；不从来源项目自动继承项目级许可结论。
快照维护见[游戏数据指南](../game-data.md)，历史调查见[investigations](../investigations/README.md)。

## 来源与用途

| 类别                 | 来源与固定身份                                                                                                            | 当前用途与通知                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 衍生代码             | [HSR-Database](https://github.com/Oereor/HSR-Database)，Commit `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0`                 | 排轴引擎、部分纯草稿 / 预设 / AV 格式化逻辑与机制测试；保留 [MIT 原通知](hsr-database-MIT.txt)，Copyright (c) 2026 oereor                        |
| 名称与别名投影       | 同一 HSR-Database 来源版本                                                                                                | 有限角色名称与已分类别名，provenance 见 [overlays.json](../../scripts/game-data/overlays.json)，无运行时旧站依赖                                 |
| 规范化数据与必要图片 | [StarRailRes](https://github.com/Mar-7th/StarRailRes)，Commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`                  | 双语条目、角色和装备 WebP；保留 [AGPL v3 文本](starrailres-AGPL-3.0.txt)，来源及转换记录见 [Manifest](../../src/data/game/manifest.json)         |
| 机制与字段参考       | [TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)，Commit `312b4597691e0a29cf9828a15b592757dba86949` | 历史字段交叉检查，不是现行更新器或构建输入；历史调查记录上游要求来源致谢、当时未发现根 LICENSE                                                   |
| UI 图标              | [Lucide](https://github.com/lucide-icons/lucide)，当前依赖版本见 [package.json](../../package.json)                       | 通过 @lucide/vue 按名称导入的图标，遵循依赖包自身通知                                                                                            |
| 本地 GitHub SVG      | [Lucide 0.468.0 的 github.svg](https://github.com/lucide-icons/lucide/blob/0.468.0/icons/github.svg)                      | 本地 Vue 组件只调整显示尺寸和线宽；保留 [ISC / Feather MIT 通知](../../public/third-party/lucide-github-LICENSE.txt)，随 public 目录进入静态构建 |
| 产品设计启发         | [HSR-Action-Planner](https://github.com/THyanNK/HSR-Action-Planner)                                                       | 行动序列模拟器的早期产品设计受到启发；本工具不是其官方版本，此条不主张复制其源码                                                                 |

来源代码 Commit 与今天只读参考文档的 Commit 是不同身份，不因参考仓库更新而改写历史 provenance。
MIT、AGPL 和图标通知按已有文本原样保留；本页不替代这些许可文本。

## 游戏内容与构建产物

游戏名称、角色、装备、美术及其他游戏知识产权归各自权利人所有；开源代码或索引仓库的许可不能替代游戏美术再分发授权。
本项目与《崩坏：星穹铁道》及其相关方无官方关联，不暗示官方认可或合作。

当前静态应用消费仓库内规范化角色 / 预设 JSON 和必要 WebP，数量与固定版本见游戏数据指南。
常规构建不会打包上游 Git 历史、原始完整索引、TextMap 或旧站生成目录，但裁剪与转换本身不消除可能适用的来源义务。
构建和技术校验通过，不构成项目许可、数据派生许可或素材公开分发问题已解决的证明。

## 发布前待确认事项

1. **项目整体许可证**：由项目维护者决定自行编写代码与文档采用何种许可，本轮不创建项目级 LICENSE。
2. **规范化数据与派生内容**：明确 StarRailRes 索引及转换产物的许可适用范围，以及需随发布提供的来源、许可和对应材料。
3. **游戏图片与视觉资源**：分别确认角色、装备图片及其他素材公开再分发的条件，不将 AGPL 或 MIT 当作游戏美术授权。
4. **发布归属方式**：确认 HSR-Database、StarRailRes、Lucide / Feather 等通知如何随公开应用提供；目前 GitHub SVG 通知会随 public 目录复制，其他现有通知位于 docs。

这些是待维护者确认的发布事项，不是已经通过的许可审查。本轮仅整理文档，不作许可决定、不公开分发或部署。
