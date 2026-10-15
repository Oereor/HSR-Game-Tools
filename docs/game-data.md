# 游戏数据与资源维护

本指南描述现行规范化快照与显式更新流程。来源与许可见[第三方说明](third-party/README.md)，运行命令总览见[开发指南](development.md)。

## 数据边界与来源

各工具从自己的数据目录读取 Schema、仓库内快照和 Adapter：[Action Planner 数据](../src/tools/action-planner/data/)与 [Warp 数据](../src/tools/warp-simulator/data/)独立维护。原始上游解析只属于显式更新器，运行时与纯模拟引擎不读取原始游戏 JSON。

当前来源分工：

- StarRailRes：双语角色属性、装备条目及必要图片，来源版本由 Source Lock 固定。
- HSR-Database：有限的人工名称与已分类别名投影，provenance 记录于 overlays。
- TurnBasedGameData：Warp 轻量物品目录的显式本地更新来源，同时保留历史机制与字段调查用途；不参与排轴更新器或普通构建。
- 装备行动预设与适用条件是工具自身规则，不由技能文案自动推断或执行。

## 快照与来源锁定

| 文件或目录                                                           | 职责                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| [catalog.json](../src/tools/action-planner/data/game/catalog.json)   | 规范化双语条目、角色身份、基础速度、预设与资源映射        |
| [manifest.json](../src/tools/action-planner/data/game/manifest.json) | 游戏版本、来源 Commit、生成参数、文件哈希、缺失资源和诊断 |
| [public/game-assets/](../public/game-assets/)                        | 有限的本地 WebP 图片，不请求上游 CDN                      |
| [source-lock.json](../scripts/game-data/source-lock.json)            | 来源仓库、固定 Commit、人工审阅的 Character ID 和转换参数 |
| [overlays.json](../scripts/game-data/overlays.json)                  | 有限名称、别名与工具预设的维护输入及来源记录              |

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

[发布函数](../scripts/game-data/publish.ts)将旧 `public/game-assets/` 与 `src/tools/action-planner/data/game/` 保存到 `.game-data-backup/<runId>/`，再安装新目录。
新数据目录包含已验证的 Manifest。移动失败时恢复旧目录；成功后清除备份，更新器在 finally 中清理本次 staging 和锁。
这不是对正在访问的浏览器提供全局原子的多目录替换，因此建议停止 dev / preview 后更新。

进程被强制终止可能留下锁、staging 或备份。确认没有更新进程、核对 runId 和备份内容后再人工恢复，不自动删除他人的锁或未知备份。
普通 validator 只检查仓库内结果，不重新生成或下载文件。

## 缺失资源与身份

缺图时省略对应 URL 并记录 missingAssets / diagnostics；UI 使用已有 fallback，不捏造资源路径。
缺速度时保留缺失值，由 UI 要求有效输入，不猜测游戏数值。新增角色身份必须经过审阅，不自动扩展已锁定的角色集合。

角色形态身份与欢愉识别使用规范化数据。已保存方案的身份与资源不一致时按[方案解析边界](architecture/action-order-simulator.md#方案格式与持久化)报告，不静默替换角色或改写旧存档。
软件或索引来源许可与游戏美术权利需分别确认；构建与校验通过不表示已经获得公开分发授权。

## Warp 数据基础设施

Warp 与上述排轴快照完全独立。本阶段只有目录、人工配置、Schema、校验和静态数据生成，没有概率模型实现、抽取引擎、会话、图片更新或页面入口。

运行时产物单独放在 `data/runtime/`，发布器只整体替换该目录，不替换包含 TypeScript 契约的 `data/`。当前已配置的成员及来源说明以人工 JSONC 为准；结构迁移不重新生成名单。

| 路径                                                                                | 职责                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| [scripts/warp-data/source-lock.json](../scripts/warp-data/source-lock.json)         | 固定 TurnBasedGameData Commit 和转换版本            |
| [scripts/warp-data/generated/](../scripts/warp-data/generated/)                     | 双语 Item Catalog、GachaID／类型索引及来源 Manifest |
| [scripts/warp-data/banners.jsonc](../scripts/warp-data/banners.jsonc)               | 人工共享候选池、Banner 和明确待办                   |
| [本地 JSON Schema](../scripts/warp-data/schema/banner-config.schema.json)           | 从目录和共享池声明生成的 VS Code 补全与结构约束     |
| [src/tools/warp-simulator/data/runtime/](../src/tools/warp-simulator/data/runtime/) | 裁剪后的运行时 snapshot 与 Manifest                 |
| [独立 TypeScript 契约](../src/tools/warp-simulator/data/schema.ts)                  | 物品、候选池和 Banner 类型；不扩展排轴 Schema       |

### 来源与身份

当前来源为 TurnBasedGameData Commit `312b4597691e0a29cf9828a15b592757dba86949`。仅提取 AvatarConfig、AvatarConfigLD、EquipmentConfig 的 ID、类型、星级和中英文名称；名称经原始 Hash 关联 CHS／EN TextMap。Node 24 reviver 的 `context.source` 保留整数 Hash 的原始十进制字符，禁止使用 Number 舍入后的值作关联键。

目录当前有 98 个角色和 170 个光锥。包含非跃迁形态、玩家名称占位符和其他未审阅抽取资格的条目；目录存在和原始 Release 字段均不能证明可抽取。只清除已核实的 `<unbreak>` 显示标签并规范空白，保留 `{NICKNAME}`。同名物品、不同形态和不同类型的相同数字 ID 均不合并，例如 `avatar:1001` 与 `avatar:1224`。

GachaBasicInfo 只投影 GachaID 和类型；索引包含 Newbie 的 `unsupported` 标记，但本轮禁止配置新手池。它不提供或推断完整成员、UP、日期或权重。没有可信游戏版本字段时以固定 Commit 标识版本，不借用排轴的游戏版本。维护 Manifest 保留六份输入文件的实际字节数／SHA-256、逐项来源表、记录键和名称 Hash。

感谢 Dimbreath 提供原始数据整理；固定来源的 [README](third-party/turnbasedgamedata-README.md) 随仓库保留。该 Commit 根目录无 LICENSE，不据此声称游戏内容获 MIT 授权。

### 显式更新和配置步骤

首次更新或切换已审阅来源版本时，先人工更新 Source Lock，再显式运行：

```bash
npm run update:warp-catalog -- --source local --root "/absolute/path/TurnBasedGameData"
npm run generate:warp-schema
```

更新器只支持本地来源；要求来源是干净的 Git 根目录，HEAD 与锁匹配。不会 fetch、切分支或修改来源；更新前后检查 Git 状态，并在发布前复核输入文件字节。Catalog 更新不发布运行时快照；来源切换后需同步 JSONC 的 `sourceCommit` 并重新审阅名单。

在 `banners.jsonc` 中维护：

- `sharedPools`：每项含唯一 `id`、`fiveStarType`（`avatar`／`light-cone`／`mixed`）、非空且不重复的 `threeStar`／`fourStar`／`fiveStar` ID 数组和非空 `evidence` 来源定位。三星只能是三星光锥，四星可混合角色与光锥，五星受声明类型约束；mixed 五星集合必须同时包含两类物品。
- `banners`：每项含唯一 `gachaId`、`kind`、`pityGroup`、`sharedPool` 引用和 `evidence`。普通角色／光锥 Event 须填写一个同类型五星 `up5` 和恰好三个同类型且不同的四星 `up4`；Fate 只填写五星 UP；Ordinary 不允许 UP 字段。
- `kind` 的五种值为 `event-avatar`、`event-light-cone`、`fate-avatar`、`fate-light-cone`、`ordinary`；`pityGroup` 分别固定为 `pity:<kind>`，是独立的继承组身份元数据，不实现或认证任何保底状态转移。Banner 的 `gacha:<GachaID>` 由生成器派生，不使用 UI GroupID 作继承组。
- `pending`：未核实类别与缺失原因。初始五类全部待填充，零个有效 Banner；待办不放宽任何有效 Banner 校验。清除待办是维护者对名单完备性的审阅，不是官方规则认证。

每个 Banner 只需引用已审阅共享池、填写 GachaID／UP 等少量字段及来源；不得复制物品名称或元数据建立身份。候选集合和 UP 是分开的输入，允许二者显式重叠，不会自动加入、剔除或赋权。名单的历史资格、完整性和来源真实性仍需维护者审阅；星缘七人自选属于未来会话状态，本阶段不提供字段。

编辑候选池 ID／类型后重新生成 Schema，再填写 Banner 引用，最后生成并验证快照：

```bash
npm run generate:warp-schema
npm run build:warp-data
npm run validate:warp-data
```

JSONC 支持注释和尾逗号，重复键会被拒绝。Schema 过期、来源不符、未知字段／ID、类型／星级错误、重复成员、UP 数量错误、空集合及非法引用均阻止快照生成。诊断包含文件、行列及配置路径。只改注释也会改变输入文件哈希，需显式重新 build；validate 只读，不自动修复或生成。

### VS Code IntelliSense 与名称查询

JSONC 顶层 `$schema` 已用相对路径关联仓库内 Schema；打开整个 HSR-Game-Tools 文件夹，保留 VS Code 内置 JSON Language Features，并使用 JSON with Comments 模式即可，无需 `.vscode` 设置、扩展或远程 Schema。若补全缓存未刷新，可重新打开文件；在空的数组元素处用 Ctrl+Space 选择共享池／五类 Banner 模板。模板中的空 ID 和空来源需要维护者填写，通过前会保留诊断。

选择物品字段时，补全按类型和星级限制 ID，说明中显示中英文名称、类型和星级，实际插入始终是内部 ID。原生 `markdownEnumDescriptions` 是说明，不保证输入其中的中文／英文就能过滤 ID；本机 VS Code 1.141.2 的语言服务探针也观察到自定义 snippet 标签未改变 ID 过滤文本。用下列离线查询补充名称查找：

```bash
npm run find:warp-item -- 三月七
npm run find:warp-item -- "March 7th" --kind avatar --rarity 4
npm run find:warp-item -- light-cone:21000
```

查询按 NFKC、大小写归一后进行名称／ID 子串匹配，返回全部匹配身份；不会用名称自动选定或写入配置。编辑器完整交互仍由维护者人工验收：分别检查角色／光锥 UP、双语说明、非法 ID 红线、三个四星 UP、Fate／Ordinary 禁用字段和共享池引用刷新。

### 产物、失败恢复与普通构建

运行时只保存有效 Banner 可达的候选池和物品，以及来源、工具版本、输入／产物哈希和计数 Manifest。无有效卡池时输出空运行时列表，Manifest 明确为 `incomplete` 并给出待办数；此时 validate 可成功，因为数据结构有效，但不能解释为已交付可抽取的真实卡池。

三个生成命令共用 `.warp-data-staging/update.lock` 独占锁。目录先在 staging 中完整验证，再备份原目录并安装；任一安装失败恢复旧目录。单文件 Schema 采用同文件系统临时文件 rename。回滚自身失败时保留锁、staging 和 `.warp-data-backup/`，避免销毁恢复材料；进程强杀也可能留下这些目录。确认无维护进程、核对 runId 与 Manifest 后人工恢复，禁止盲删未知锁或备份。目录替换不提供进程强杀下的无间隙可用性，更新前建议停止 dev／preview。

生成产物可跟踪，只有 staging／backup／cache 被忽略；生成 JSON 使用固定序列化，不交给 Prettier 改写。普通 install、dev、test、build 无上游路径、网络数据请求或自动生成钩子；需要完全离线安装 npm 包时使用已有缓存及 `npm ci --offline`。Warp 目前没有运行时消费入口，不因本轮数据基础设施新增路由或发布配置。
