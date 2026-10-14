# 游戏数据与资源维护

本指南描述现行规范化快照与显式更新流程。来源与许可见[第三方说明](third-party/README.md)，运行命令总览见[开发指南](development.md)。

## 数据边界与来源

应用从 [src/data/](../src/data/) 读取工具 Schema、仓库内快照和 Adapter；原始上游解析只属于显式更新器，运行时与纯模拟引擎不读取原始游戏 JSON。

当前来源分工：

- StarRailRes：双语角色属性、装备条目及必要图片，来源版本由 Source Lock 固定。
- HSR-Database：有限的人工名称与已分类别名投影，provenance 记录于 overlays。
- TurnBasedGameData：历史机制与字段调查参考，不是现行更新器输入。
- 装备行动预设与适用条件是工具自身规则，不由技能文案自动推断或执行。

## 快照与来源锁定

| 文件或目录                                                | 职责                                                      |
| --------------------------------------------------------- | --------------------------------------------------------- |
| [catalog.json](../src/data/game/catalog.json)             | 规范化双语条目、角色身份、基础速度、预设与资源映射        |
| [manifest.json](../src/data/game/manifest.json)           | 游戏版本、来源 Commit、生成参数、文件哈希、缺失资源和诊断 |
| [public/game-assets/](../public/game-assets/)             | 有限的本地 WebP 图片，不请求上游 CDN                      |
| [source-lock.json](../scripts/game-data/source-lock.json) | 来源仓库、固定 Commit、人工审阅的 Character ID 和转换参数 |
| [overlays.json](../scripts/game-data/overlays.json)       | 有限名称、别名与工具预设的维护输入及来源记录              |

当前锁定快照为游戏版本 4.6.0，包含 98 个角色、3 个预设和 101 张 WebP。数量是该快照的核对结果，不是永久 Schema 约束。
来源 Commit 为 `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`；快照文件及必要资源保持可跟踪，缓存、staging 和备份由 .gitignore 排除。

当前角色图片为 256×256，装备图片为 128×128。更新器统一按 Source Lock 的 `maxSize: 256` 等比缩放且不放大；128×128 是当前资源的实际尺寸，不是单独的装备尺寸上限。
转换版本、质量和 alphaQuality 由 Source Lock 管理，Manifest 记录实际 Sharp 版本和生成时间。

## 显式更新流程

只有明确授权的数据维护任务才能运行更新器；普通安装、dev、test 和 build 不生成数据或访问上游仓库。

1. 准备 StarRailRes 的独立本地 Git 仓库。指定路径必须是 Git 根目录，工作区干净，HEAD 与 Source Lock 一致。
2. 审阅需要的 Character ID、名称与预设输入；更新来源与转换参数属于单独的数据变更，不在文档任务中顺带修改。
3. 建议先停止本项目的 dev / preview，再显式更新：

```bash
npm run update:game-data -- --source local --root "/absolute/path/StarRailRes"
npm run validate:game-data
```

[更新器](../scripts/update-game-data.ts)只实现本地来源，不 fetch、不切上游分支、不修改上游，不自动提交；远程下载模式未实现。
完成后审阅 catalog、Manifest、图片集合、缺失诊断与来源差异，再启动或刷新应用。

## 校验、发布与回滚

生成内容先写入 `.game-data-staging/<runId>/`；`.game-data-staging/update.lock` 用独占创建阻止并发更新。
发布前的[文件校验](../scripts/game-data/files.ts)核对 Schema、游戏版本、来源锁定、审阅 ID 集合、转换参数、overlay 哈希、文件 inventory、bytes / SHA-256 和图片格式尺寸。

[发布函数](../scripts/game-data/publish.ts)将旧 `public/game-assets/` 与 `src/data/game/` 保存到 `.game-data-backup/<runId>/`，再安装新目录。
新数据目录包含已验证的 Manifest。移动失败时恢复旧目录；成功后清除备份，更新器在 finally 中清理本次 staging 和锁。
这不是对正在访问的浏览器提供全局原子的多目录替换，因此建议停止 dev / preview 后更新。

进程被强制终止可能留下锁、staging 或备份。确认没有更新进程、核对 runId 和备份内容后再人工恢复，不自动删除他人的锁或未知备份。
普通 validator 只检查仓库内结果，不重新生成或下载文件。

## 缺失资源与身份

缺图时省略对应 URL 并记录 missingAssets / diagnostics；UI 使用已有 fallback，不捏造资源路径。
缺速度时保留缺失值，由 UI 要求有效输入，不猜测游戏数值。新增角色身份必须经过审阅，不自动扩展已锁定的角色集合。

角色形态身份与欢愉识别使用规范化数据。已保存方案的身份与资源不一致时按[方案解析边界](architecture/action-order-simulator.md#方案格式与持久化)报告，不静默替换角色或改写旧存档。
软件或索引来源许可与游戏美术权利需分别确认；构建与校验通过不表示已经获得公开分发授权。
