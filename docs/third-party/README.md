# 第三方来源与发布状态

本任务只进行本地迁移、生成和验证，不自动提交或推送第三方数据与资源；新项目整体许可证尚未决定。

| 内容 | 来源与固定版本 | 当前处理 |
| --- | --- | --- |
| 排轴引擎、纯草稿／预设／AV 格式化逻辑、机制测试 | HSR-Database，Commit `72c2d4d1b9ccc0fc0bb191d16ac29492750ea1b0` | 保留 [MIT 原通知](hsr-database-MIT.txt)，版权行 Copyright (c) 2026 oereor |
| 角色名称与已分类别名配置 | 同一旧站版本的有限角色投影 | provenance 记录于 overlays.json；没有全局搜索／旧生成器依赖 |
| 规范化游戏快照及必要图标 | StarRailRes，Commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；版本 4.6.0 | 保留 [上游 AGPL v3 文本](starrailres-AGPL-3.0.txt)；源路径与转换校验记录于 Manifest |
| Phase 0 的权威字段交叉检查 | TurnBasedGameData，Commit `312b4597691e0a29cf9828a15b592757dba86949` | 本阶段更新器不读取此仓库；上游 README 请求来源致谢，未发现根 LICENSE |
| 首页 GitHub 图标 | [Lucide 0.468.0 的 github.svg](https://github.com/lucide-icons/lucide/blob/0.468.0/icons/github.svg) | 本地 Vue SVG 组件仅调整显示尺寸和线宽；保留 [ISC / Feather MIT 通知](../../public/third-party/lucide-github-LICENSE.txt)，构建时随 public 目录复制 |

来源链接：[HSR-Database](https://github.com/Oereor/HSR-Database)、[StarRailRes](https://github.com/Mar-7th/StarRailRes)、[TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)。

未来静态应用预计分发规范化角色／预设 JSON 和 101 张必要 WebP；不分发原始索引、TextMap、完整游戏资源、上游 Git 历史或旧站生成目录。资源版权归原权利人；开源仓库许可证不能替代游戏美术授权。

尚待正式分发前确认：索引及其派生产物的许可义务、归属说明如何随应用提供、游戏美术再分发条件和新工具代码的整体许可证。本地测试通过不代表这些许可问题已经解决。
