# HSR-Game-Tools

《崩坏：星穹铁道》非官方游戏工具集合，使用 Vue 3、TypeScript、Vite、Vue Router、PrimeVue 4、Tailwind CSS 4、Lucide Icons 和 vue-i18n。

首页提供 **行动序列模拟器 / Action Order Simulator** 入口，抽卡模拟器 / Warp Simulator 和遗器模拟器 / Relic Simulator 暂为静态预览。行动序列模拟器的路由仍为 `/action-planner`，现有方案文件与内部标识保持兼容。

行动序列模拟器的早期设计受到 [HSR-Action-Planner](https://github.com/THyanNK/HSR-Action-Planner) 启发；本工具不是该项目的官方版本。实际代码与数据来源见[第三方来源说明](docs/third-party/README.md)。

当前已完成 **Phase 2C-1：阿哈时刻功能接入**。`/action-planner` 使用 PrimeVue Styled Mode + Aura 深色金色主题，配置和五类操作提交后通过现有纯引擎重新推演；支持动态参与者、共享倒计时、装备预设、当前队列观察、自动存档、完整 JSON 导入／导出，以及 MoC／AA 轮次、实时派生速度的阿哈时刻及其自身速度效果。

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

首页卡片标题与简介位于 `home.tools.actionOrder`、`home.tools.warp`、`home.tools.relic`，分别维护 `title` 和 `description`。`home.title`、`home.toolsHeading`、`home.github`、`home.disclaimer` 管理首页其他文案；`site.description` 管理页面 Meta Description。行动序列模拟器的正式名称还用于 `planner.title`，修改产品名称时需与首页卡片同步。

`src/tools/catalog.ts` 只保存工具 ID、Lucide 图标和可选路由。无路由时展示静态卡片，不参与键盘链接导航；未来工具实际完成并注册路由后，为对应目录项添加 `route` 即可开放入口。目录不保存翻译文本，也不根据翻译判断状态。

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

## 行动序列模拟器使用

首次打开进入战斗配置：四个空槽、无操作，预算为 60 节点／600 AV。角色选择器搜索全部 98 条快照记录，支持名称、别名和本地化形态标签；不同形态按独立 ID 选择，同一角色 ID 不重复占槽。选择角色填入基础速度，面板速度可独立修改。

点击“应用配置”统一提交我方、最多五名初始敌人、速度、轮次模式和预算。敌人可自由命名，单个 SPD 留空直到填写；基础与面板速度都使用该 SPD，默认无限自然行动。未应用的输入在切换 Tabs 后仍保留，行动模拟展示已提交计划。预算最高 500 节点／100000 AV。更换角色或删除后重建单位生成新 Actor ID，修改名称或速度保留 ID；已有操作保持原引用，失效引用通过诊断处理。

行动模拟可选战斗开始、角色行动、事件触发或轮次边界节点。支持提前、延后、立即行动、速度效果与创建 Actor／单次事件；操作可编辑、删除、在同一结算窗口内排序，修改阶段进入新窗口末尾。速度效果支持固定值、基础速度百分比、有限／无限回合或共享倒计时。空回合数和行动次数表示无限。倒计时只接受显式单目标提前／延后。

装备入口生成舞舞舞 24%、翁瓦克 40%（仅战斗开始）、翔鹰 25% 的普通草稿，目标和参数仍可编辑。预设不自动检查装备条件或执行角色技能。每类操作支持自定义名称，留空采用随语言与实际目标时点变化的自动名称；操作名称独立于实体名称。

未来行动上方显示推进 AV、下方突出累计 AV；当前队列展示事件刚开始时的当前行动者（顶部 0.00 AV）与其他单位的剩余 AV、速度，并支持前后步进。队列只是观察视图，Inspector 选择与推进位置独立，编辑仍绑定真实事件锚点；切换导航模式保留推进位置。左侧绿色／红色／黄色圆点分别表示我方／敌方／事件或其他节点，不重复显示阵营文字。蓝色上箭头、红色下箭头、蓝色闪电分别表示该待行动受到的提前、延后、立即行动；合法效果即使不改变 AV 也会显示，三种标记可以共存。节点上的中性配置图标表示这里配置了操作。

新建普通草稿默认动作后；编辑旧操作保留原阶段，未显式指定阶段的旧操作保持行动前语义。Inspector 的目标头像和参数来自操作执行时点与真实结构化配置，不根据自定义标题省略参数。四个工具按钮放在右上角；超过四个目标时可通过 `+N` 查看全部目标。

编辑占用整个 Inspector。取消或切换节点、工作阶段、导航模式直接丢弃未提交操作草稿。不可达事件保留原锚点，可查看、删除操作或删除整组事件；没有可靠上下文时不能新增目标操作，可返回配置调整预算。运行时错误保留真实诊断，允许修复已有配置。新建空方案会清空文档与导航并更新存档；已有内容或草稿被替换前需要确认。

桌面可拖动 Splitter，也可聚焦分隔柄并持续按左右方向键；PrimeVue 4.5.5 内置键盘重复器间隔为 40ms，极短的单击按键可能不生效。低于 960px 使用上方限高行动列表、下方 Inspector，编辑模式会定位表单标题。

本轮未实现角色专用技能、真实敌人目录、多波次、伤害／能量、账号、云同步或多方案库。主题和职责约定见 [Design Notes](docs/design-notes.md)。历史截图仅属于此前阶段，本轮没有真实浏览器验收记录。

## 当前生效的速度效果

行动卡片与 Inspector 显示该自然行动开始时实际生效的速度 Modifier；等待队列显示当前时刻的效果，初始队列包含战斗开始操作已添加的效果。每个 Modifier 单独显示，正值蓝色、负值红色、零值中性，保留原始固定幅度或百分比，例如“速度 +60”“速度 +20%”，不合并独立效果。

悬停 Tag 查看剩余回合、无限持续或关联倒计时的名称及配置速度。卡片聚焦时可查看完整效果摘要；Inspector 的 Tag 可单独聚焦。当前回合尚未执行的操作不会提前出现在 Tag 中，效果是否到期由引擎状态决定。阿哈只显示自身真实效果，不将欢愉速度贡献显示为 Buff。原有提前、延后和立即行动图标继续位于 AV 下方，速度变化本身不产生这些图标。

Tag 自动换行，没有效果时不额外增加行。中文／English 及窄屏、Tooltip 与键盘交互仍由用户本地人工验收。

## 阿哈时刻

初始我方编队包含欢愉命途角色时，配置区自动显示阿哈时刻。它是中立自然行动单位，不占我方或敌方槽位，无须启用开关。紧凑标题使用 Smile 和黄色中立点，下方双列显示基础速度输入和只读面板速度，窄屏改为单列。基础速度默认 80，可在同一个“应用配置”流程中修改；只读面板速度采用草稿编队的面板速度，尚未计入战斗开始操作。暂时移除欢愉角色会隐藏阿哈，但保留基础速度、ID 和已有操作。

阿哈速度为自身基础速度，加上当前欢愉角色有效速度按降序计算的 1/5、1/10、1/20、1/40 贡献，再加自身固定值和百分比速度效果。百分比只基于阿哈基础速度；贡献者变速时重新排名，阿哈剩余 AG 不重置。行动中的角色仍贡献，达到行动次数限制离队后停止贡献；已生成的阿哈继续自然行动。

阿哈可明确选作速度效果目标，支持与普通单位混选、有限／无限回合及共享倒计时。它不属于我方／敌方全体，也不能被直接提前、延后或立即行动。自身回合开始前已有的回合 Buff 才在结束时递减，新加效果不在当前回合立即到期。阿哈节点支持普通操作及行动前／后窗口，两种行动视图显示黄色中立点和 Smile 图标；加速不产生拉条箭头。

Version 3 保存贡献者 ID 作为模拟输入，导入不会随游戏快照变化静默重建。明确应用编队时更新已知角色身份；资源缺失时保留原配置并提示。用户添加的速度效果保存为普通操作，运行时速度和 Modifier 实例不保存。

“持续到阿哈时刻结束”暂按一个自然回合处理；额外回合、欢愉技、笑点和技能自动触发均未实现。真实浏览器交互及视觉由用户人工验收。

## Endgame 轮次

默认关闭。战斗配置的单选控件支持混沌回忆（MoC）和异相仲裁（AA），需要点击“应用配置”后生效。第 0 轮分别为 150／300 AV，之后每轮 100 AV；第 n 个边界为首轮 AV + 100 × (n−1)。

轮次是独立 System Event，不属于 Participant，没有 SPD、AG 或阵营，也不能成为任何操作的目标。同累计 AV 时，普通 Actor、阿哈时刻、Scheduled Event 及它们插入的零 AV 行动全部优先；每次结算重新检查队列，最后才进入轮次边界。边界自身产生的立即行动在边界完成后执行。轮次计入节点预算，遵守 AV 上限，空队列不会继续向未来生成轮次。

轮次节点显示“第 N 轮开始”，可通过 Inspector 配置标准操作，只有一个无 phase 的结算窗口。当前队列同时显示下一轮次剩余 AV，系统节点不显示速度。操作绑定稳定的 `cycleBoundary` ordinal Anchor；MoC／AA 切换改变触发时间但保留操作。关闭模式保留操作并列为停用配置，可查看、删除，重新启用后恢复执行与编辑。轮次不重置单位 AG，也不递减速度 Buff 的回合数。

暂不支持跨波次、轮次重置／保留规则、自定义轮长或其他新战斗机制。

## 方案保存与 JSON

战斗配置顶部提供方案管理。方案名失焦／回车提交；其他配置和操作只有明确应用／提交后才保存。当前方案使用 localStorage 的 `hsr-game-tools/action-planner/current` 键，启动先恢复再监听提交。导航、队列游标、语言和草稿不保存；退出页面不补写旧内容。

导入、导出、存档和模板共用 `format: "hsr-game-tools/action-planner"`、`version: 3`、`document: { name, plan, metadata }`。Version 1 / 2 文件和旧存档在严格校验后迁移：Version 1 补入 `cycleMode: "none"`，两者补充阿哈配置。可识别的初始欢愉角色会自动生成阿哈，因此行动顺序及预算内可达节点可能变化；旧 ID、锚点和操作保留。启动迁移不立即回写存档，导出统一使用 Version 3。导出文件保留数学精度、Actor／Operation ID、Anchor、阶段、顺序及名称映射；不包含运行结果。导入先校验并推演，再确认完整替换，失败或取消保留当前方案。

初始编队限制为四名我方、五名敌方；初始敌人导入时以基础速度统一 SPD。当前数据中缺失的 Character ID 保留原配置并提示，不换角色；自定义图片仅允许资源清单中的相对路径。文件上限仍为 2 MiB、1,000 个事件、2,000 个操作；详细字段边界见 Phase 2A 报告。

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
- [Phase 2C-0 阿哈架构调查](docs/investigations/action-planner-aha-instant-architecture.md)
- [SPD Modifier Tag 展示](docs/investigations/action-planner-speed-modifier-visualization.md)
- [Phase 2C-1 阿哈功能实施](docs/investigations/action-planner-aha-instant-implementation.md)
- [Phase 2B Endgame 轮次系统](docs/investigations/action-planner-endgame-cycle-system.md)
- [第三方来源、许可证文本与发布限制](docs/third-party/README.md)

整体项目许可证尚未确定。复制的引擎保留 MIT 通知；StarRailRes 索引许可与游戏美术授权需分别处理。当前数据和图片用于本地验证，未经确认不得擅自提交、推送或公开分发第三方资源。本轮没有发布或配置 Vercel。
