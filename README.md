# HSR-Game-Tools

《崩坏：星穹铁道》独立游戏工具站，使用 Vue 3、TypeScript、Vite、Vue Router、Tailwind CSS 4 和 vue-i18n。

当前已完成 **Phase 2A：方案持久化、配队模板入口与初始敌方编队**。`/action-planner` 使用 PrimeVue Styled Mode + Aura 深色金色主题，配置和五类操作提交后通过现有纯引擎重新推演；支持动态参与者、共享倒计时、装备预设、当前队列观察、自动存档和完整 JSON 导入／导出。

## 本地运行

**UI Polish Round 1 / Site Messages** 已收敛自动命名与卡片 Metadata，新增立即行动 Trace 和阵营圆点；新建普通操作默认在动作后结算。视觉验收由用户完成，本轮工程验证和已观察到的浏览器行为见 [UI 与本地化报告](docs/investigations/action-planner-ui-polish-localization.md)。

需要 Node 24（最低 24.12，本轮验证版本 24.19.0）与 npm，使用唯一 `package-lock.json`。

```sh
npm ci
npm run dev
```

按照终端显示的本地 URL 打开首页或 `/action-planner`。安装只需访问 npm 注册表；正常开发、测试和构建不需要三个来源仓库。语言默认简体中文，可以运行时切换 English；语言选择不持久化，已提交的当前方案自动保存并在刷新后恢复。

本地特殊网络环境下，安装应使用系统代理，例如：

```sh
npm ci --proxy=http://127.0.0.1:7890 --https-proxy=http://127.0.0.1:7890
```

参数只作用于本次命令，不修改全局 npm 配置；其他开发环境按自己的代理设置安装。

## 检查与静态构建

```sh
npm run type-check
npm test
npm run lint
npm run format:check
npm run validate:i18n
npm run validate:game-data
npm run validate:planner-templates
npm run build
npm run preview
```

`build` 输出 `dist/`，只打包现有快照，不下载数据或重新转换图片；发布前应运行上述数据校验。History 路由需要宿主配置 SPA fallback。本轮仅完成静态与单元验证，真实浏览器交互和视觉由用户本地人工验收；默认不执行浏览器自动化或截图。

`npm run format` 用于明确需要的格式修复，lint 默认不写文件。`npm run bench:engine` 输出少量性能探针，不设置机器相关硬阈值。

## Site Messages 维护

中文文案修改 `src/locales/zh-CN.json`，英文文案修改 `src/locales/en.json`。两份文件只包含嵌套命名空间与字符串消息；`src/locales/types.ts` 的 `SiteMessages` 从中文结构推导，`index.ts` 使用现有 vue-i18n Composition API 加载，无全局语言回退。

新增 Key 时在两份文件的相同语义路径添加消息，例如 `planner.metadata.duration`。保留合理的 `ui.*`；新增功能使用稳定的 `planner.operationName`、`planner.metadata`、`planner.navigator` 等命名空间，不以某个组件或翻译内容作为身份。

动态文案用 Vue I18n 命名插值，例如中文 `"持续 {count} 回合"`、英文 `"Lasts {count} turns"`，调用 `t('planner.metadata.duration', { count })`。纯命名／Metadata 模型返回 `{ key, params }`；`renderMessage` 递归翻译嵌套目标描述并用当前 Locale 格式化原始数字。完整自然语言句式放在 JSON，避免在 TypeScript 拼接词序、冠词或增减句子。AV 固定两位，SPD／百分比最多六位小数；展示字符串不回写计划。

修改后执行 `npm run validate:i18n`，检查严格 JSON、重复 Key、结构和类型、空翻译、插值参数集合及当前消息编译器的格式兼容性；失败时修复两份文件，不通过关闭告警或全局回退掩盖漏翻。

UI、Tooltip、ARIA 和校验提示属于 Site Messages；官方角色／装备名称来自规范化游戏数据；用户操作、实体及倒计时名称保持用户原文。自动标题随语言变化，不持久化；自定义标题按 operation ID 保存，留空恢复自动命名。语言切换不改计划、稳定 ID 或模拟结果，执行时点上下文按计划和锚点缓存。

目标／命名测试验证 ID、数量、语义 Key 与参数；自定义名称测试验证优先级及恢复。不要逐字断言全部翻译，不用翻译后的文本做业务判断。少量集成测试验证实际插值与切换语言即可。

## 显式更新游戏数据

当前固定版本快照包含 98 个角色、3 个预设与 101 张 WebP。角色图保留 256×256，装备图保留 128×128，不放大。转换参数位于独立 source lock，可调整并升级版本。

```sh
npm run update:game-data -- --source local --root "/absolute/path/StarRailRes"
npm run validate:game-data
```

指定目录必须是干净的 Git 根目录，HEAD 匹配 `scripts/game-data/source-lock.json`。更新器不 fetch、不切分支、不修改来源、不自动提交；生成后先校验，再替换快照和图片，异常时回滚，更新锁阻止并发执行。

缺图时省略对应 URL 并记录诊断；缺速度留空，不猜游戏数值。新增角色 ID 需要审阅 source lock；名称／别名配置保留来源记录。远程下载模式尚未实现。

建议停止 dev／preview 后更新，再启动或刷新。多目录替换不是对浏览器的全局原子操作。进程被强制终止可能遗留 `.game-data-staging/update.lock` 和备份；确认没有更新进程、检查 run ID 和备份后再人工恢复，不自动清理他人的锁。

## 架构与阶段边界

- `src/engine/action-planner/`：纯 TypeScript 引擎，不依赖 Vue、DOM、Node 文件系统、游戏数据或翻译。
- `src/tools/action-planner/`：纯编辑辅助、预设、轻量搜索、展示格式与页面级 Composable。
- `src/data/`：工具 schema、已生成快照和 adapter，原始索引只在更新器解析。
- `public/game-assets/`：有限本地图片，不请求上游 CDN。
- `scripts/`：显式更新、校验和性能探针，没有隐藏的数据更新钩子。

## 排轴编辑器使用

首次打开进入战斗配置：四个空槽、无操作，预算为 60 节点／600 AV。角色选择器搜索全部 98 条快照记录，支持名称、别名和本地化形态标签；不同形态按独立 ID 选择，同一角色 ID 不重复占槽。选择角色填入基础速度，面板速度可独立修改。

点击“应用配置”统一提交我方、最多五名初始敌人、速度和预算。敌人可自由命名，单个 SPD 留空直到填写；基础与面板速度都使用该 SPD，默认无限自然行动。未应用的输入在切换 Tabs 后仍保留，行动规划展示已提交计划。预算最高 500 节点／100000 AV。更换角色或删除后重建单位生成新 Actor ID，修改名称或速度保留 ID；已有操作保持原引用，失效引用通过诊断处理。

行动规划可选战斗开始、角色行动或事件触发节点。支持提前、延后、立即行动、速度效果与创建 Actor／单次事件；操作可编辑、删除、在同一结算窗口内排序，修改阶段进入新窗口末尾。速度效果支持固定值、基础速度百分比、有限／无限回合或共享倒计时。空回合数和行动次数表示无限。倒计时只接受显式单目标提前／延后。

装备入口生成舞舞舞 24%、翁瓦克 40%（仅战斗开始）、翔鹰 25% 的普通草稿，目标和参数仍可编辑。预设不自动检查装备条件或执行角色技能。每类操作支持自定义名称，留空采用随语言与实际目标时点变化的自动名称；操作名称独立于实体名称。

未来行动上方显示推进 AV、下方突出累计 AV；当前队列展示事件刚开始时的当前行动者（顶部 0.00 AV）与其他单位的剩余 AV、速度，并支持前后步进。队列只是观察视图，Inspector 选择与推进位置独立，编辑仍绑定真实事件锚点；切换导航模式保留推进位置。左侧绿色／红色／黄色圆点分别表示我方／敌方／事件或其他节点，不重复显示阵营文字。蓝色上箭头、红色下箭头、蓝色闪电分别表示该待行动受到的提前、延后、立即行动；合法效果即使不改变 AV 也会显示，三种标记可以共存。节点上的中性配置图标表示这里配置了操作。

新建普通草稿默认动作后；编辑旧操作保留原阶段，未显式指定阶段的旧操作保持行动前语义。Inspector 的目标头像和参数来自操作执行时点与真实结构化配置，不根据自定义标题省略参数。四个工具按钮放在右上角；超过四个目标时可通过 `+N` 查看全部目标。

编辑占用整个 Inspector。取消或切换节点、工作阶段、导航模式直接丢弃未提交操作草稿。不可达事件保留原锚点，可查看、删除操作或删除整组事件；没有可靠上下文时不能新增目标操作，可返回配置调整预算。运行时错误保留真实诊断，允许修复已有配置。新建空方案会清空文档与导航并更新存档；已有内容或草稿被替换前需要确认。

桌面可拖动 Splitter，也可聚焦分隔柄并持续按左右方向键；PrimeVue 4.5.5 内置键盘重复器间隔为 40ms，极短的单击按键可能不生效。低于 960px 使用上方限高行动列表、下方 Inspector，编辑模式会定位表单标题。

本轮未实现角色专用技能、真实敌人目录、多波次、伤害／能量、账号、云同步或多方案库。主题和职责约定见 [Design Notes](docs/design-notes.md)。历史截图仅属于此前阶段，本轮没有真实浏览器验收记录。

## 方案保存与 JSON

战斗配置顶部提供方案管理。方案名失焦／回车提交；其他配置和操作只有明确应用／提交后才保存。当前方案使用 localStorage 的 `hsr-game-tools/action-planner/current` 键，启动先恢复再监听提交。导航、队列游标、语言和草稿不保存；退出页面不补写旧内容。

导入、导出、存档和模板共用 `format: "hsr-game-tools/action-planner"`、`version: 1`、`document: { name, plan, metadata }`。导出文件保留数学精度、Actor／Operation ID、Anchor、阶段、顺序及名称映射；不包含运行结果。导入先校验并推演，再确认完整替换，失败或取消保留当前方案。

初始编队限制为四名我方、五名敌方；初始敌人导入时以基础速度统一 SPD。当前数据中缺失的 Character ID 保留原配置并提示，不换角色；自定义图片仅允许资源清单中的相对路径。Version 1 文件上限为 2 MiB、1,000 个事件、2,000 个操作；详细字段边界见本轮报告。

坏存档或不支持版本保留原始内容并暂停自动保存，可备份原始存档后明确覆盖。其他标签页修改或清空存档时，本页不自动替换，也不自动覆盖外部版本；可导出本页 JSON、载入存档或明确覆盖。存储不可用／写入失败时继续编辑并导出备份，只有成功写入才显示已保存。没有跨标签页合并或实时协作。

## 正式配队模板维护

常见配队入口位于战斗配置的方案管理区。**目前正式目录为空**，不会根据截图编造速度或技能效果。

1. 在工具中配置完整方案，导出并人工审阅 JSON。
2. 将文件放入 `src/tools/action-planner/templates/plans/`。
3. 在 `templates/catalog.ts` 显式导入 JSON，登记唯一 ID、排序、名称与简介 Message Key、可选条件 Key／游戏版本及 `file`。
4. 在 `zh-CN.json` 和 `en.json` 添加相同 Key 的介绍；头像从方案中的角色映射提取。
5. 执行 `npm run validate:planner-templates`、`npm run validate:i18n` 和文档相关测试。

注册示例（文件内容必须来自正式审阅）：

```ts
import reviewedPlan from './plans/reviewed-plan.json'

export const plannerTemplates: readonly PlannerTemplate[] = [
  {
    id: 'reviewed-plan',
    order: 0,
    nameKey: 'planner.teamTemplates.reviewedPlan.name',
    descriptionKey: 'planner.teamTemplates.reviewedPlan.description',
    file: reviewedPlan,
  },
]
```

加载获得独立、可编辑的当前文档，完整替换旧方案，不影响模板 JSON。模板更新不会自动覆盖正在编辑的方案。

## 报告与第三方来源

- [Phase 0 架构调查](docs/investigations/phase-0-migration-architecture.md)
- [Phase 1A 实施与隔离验收](docs/investigations/phase-1a-independent-foundation.md)
- [Phase 1B-0 组件库验证与浏览器验收](docs/investigations/phase-1b-component-library-spike.md)
- [Phase 1B-1 真实编辑器与浏览器验收](docs/investigations/phase-1b-functional-action-planner-editor.md)
- [UI Polish Round 1 与 Site Messages](docs/investigations/action-planner-ui-polish-localization.md)
- [当前队列重构](docs/investigations/action-planner-current-queue-view-reconstruction.md)
- [Phase 2A 持久化、模板与敌方编队](docs/investigations/action-planner-persistence-templates-enemy-setup.md)
- [第三方来源、许可证文本与发布限制](docs/third-party/README.md)

整体项目许可证尚未确定。复制的引擎保留 MIT 通知；StarRailRes 索引许可与游戏美术授权需分别处理。当前数据和图片用于本地验证，未经确认不得擅自提交、推送或公开分发第三方资源。本轮没有发布或配置 Vercel。
