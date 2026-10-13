# HSR-Game-Tools Design Notes

Phase 1B-1 真实编辑器及 UI Polish Round 1。沿用已验收的 Phase 1B-0 主题，独立于 HSR-Database 的样式体系。视觉效果最终由用户验收。

## 主题与职责

主题入口为 `src/theme/preset.ts`，使用 `definePreset(Aura, …)`。优先 Primitive、Semantic Tokens，仅为 Tabs、ToggleButton、Button、Splitter 添加必要的 Component Tokens。Aura 部分 Token 位于 `colorScheme.dark`，自定义时保持同样层级，否则浅层覆盖可能不生效。

| 语义             | Token／起始值                     | 使用                              |
| ---------------- | --------------------------------- | --------------------------------- |
| 页面             | graphite.950 / `#17191D`          | 工作区基底                        |
| 次级 Surface     | graphite.900 / `#22252B`          | 输入、业务卡片                    |
| 浮层 Surface     | graphite.800 / `#2B2E34`          | Tooltip 等小浮层；Dialog 使用 900 |
| 主文字           | graphite.50 / `#F1EEE7`           | 正文、标题                        |
| 辅助文字         | graphite.400 / `#969AA3`          | 次级状态                          |
| 强调             | gold.400 / `#C9A86B`              | 主按钮、选择、Focus               |
| 边框             | graphite.700 / `#3B4049`          | 中性分隔，业务卡片可降低透明度    |
| 提前／延后／友方 | `#5FA9E7` / `#E16B71` / `#67BD96` | 仅用于对应语义                    |

深色 Primary 的 Hover／Active 为 gold.300／200，文字使用 graphite.950。Highlight 使用金色 10%／17% 透明背景。Focus Ring 为 2px、offset 3px；输入和按钮圆角 6px，业务卡片 6–8px。金色不用于普通输入的常驻边框。

固定 `.app-dark` 在 html，PrimeVue `darkModeSelector` 与 Tailwind dark variant 一致，body Portal 可继承 Token。CSS 层顺序：`theme → base → primevue → components → utilities`。Tailwind Preflight 位于 base；业务样式位于 components，布局 Utilities 可按需覆盖。`tailwindcss-primeui` 通过 Tailwind 4 CSS 入口导入。

PrimeVue 负责 Tabs、表单、按钮、Dialog、Tooltip、Splitter；Tailwind 与工具 CSS 负责空间、行动卡、操作卡、头像和语义标识。不使用 PrimeVue Card 决定信息架构，不覆盖成片的内部组件类。

## 工作区约定

桌面先用 35%／65% Splitter；最小宽度换算包含 gutter 余量，Navigator 至少约 320px、Inspector 约 440px。低于 960px 上下布局，Navigator 最大 280px，Inspector 随页面展开。桌面两侧分别滚动，避免再给整个工作区添加第三层滚动容器。

未来行动在上方弱化显示 +推进 AV、下方突出累计 AV，右对齐并启用 tabular numbers；当前队列在战斗开始位置读取已结算开始操作的初始 Snapshot，其他位置读取 NodeRecord.beforeEffects。当前行动卡置顶，AV 为 0.00，使用金色轻背景和紧凑标识；下方等待卡仅显示剩余 AV／有效速度，累计 AV 由控制栏显示。AV 固定两位，内部数值不四舍五入。9px 实心圆点表示阵营：我方绿、敌方红、事件／系统／未知节点黄，黄色来自主题 `event.500` Token；配套本地化 Tooltip 与可访问名称，行动卡 Metadata 不重复输出阵营文字。

队列推进位置与 Inspector 选择分别拥有状态。每次前进进入一个实际事件节点并选中它；点击等待卡只切换 Inspector。模式切换保留推进 Anchor，重算后 Anchor 不可达则队列回到战斗开始，Inspector 仍保留原 Anchor 的修复入口。当前行动卡使用 NodeRecord.actionChanges，等待卡使用 QueueEntry.actionChanges。倒计时 beforeEffects 沿用引擎先移除到期速度修正的窗口，不改变生命周期或结算后 Snapshot 语义。

标记只读取与目标 anchorKey 匹配的已提交 Trace：蓝色 ArrowUp、红色 ArrowDown、蓝色 Zap 可共存。按本轮用户确认，合法效果即使没有 AG／AV 或排序变化也显示。零百分比效果亦保留；不以净变化互相抵消。Trace 的原始数值和 zeroAVInsertion 仍描述真实数学／插队，立即行动保持独立类型。配置图标是独立中性语义，不能充当受影响标记。长名称截断且保留完整 title，Inspector 名称允许换行。

操作卡按实际结算窗口分组，标题采用集中语义命名模块与 Site Messages，自定义名称优先，空白恢复自动命名。右上角保留上移、下移、编辑、删除四个 PrimeVue 图标按钮，不占底部整行。Padding 12px，Metadata 正文约 13px，参数组可换行；避免嵌套 Card、占位短横线及机械点分隔。

单目标始终显示头像与名称；多目标使用实际执行时点的头像组，每个头像有名称 Tooltip，预览四个并通过 +N Popover 查看完整名单。缺少可靠上下文时显示范围及不可解析状态，不使用初始队伍数量或最终目录虚构实际目标。Metadata 始终由配置生成：提前／延后的百分比、速度修正模式和有符号数值、回合或倒计时名称与速度、创建实体名称及其适用属性，独立于标题。上下移动限制在同一窗口，阶段变更进入新窗口末尾。

概览和编辑互斥。节点、工作阶段或导航模式切换丢弃操作草稿；取消不改变已提交操作。配置草稿由“应用配置”统一提交双方编队与预算，独立于操作草稿。页面唯一已提交文档为 PlannerDocument，包含方案名称、plan 和 metadata；改变 plan 后真实重算，仅修改方案名或自定义操作名不重算。

战斗配置依次显示方案管理、我方四槽、敌方单位和推演范围。方案名失焦／回车提交；初始敌方最多五名，名称可重复，单个 SPD 留空直到用户填写，桌面小卡片双列、窄屏单列。双方位置各自编号。修改速度保留 ID，替换角色／删除后重建产生新 ID；保留合法导入字段和失效操作诊断。导入初始敌人以基础速度统一两项 SPD，页面不显示差异提示。

方案管理使用紧凑名称、状态与按钮行，普通导入和常见配队共用完整文档恢复流程。非空方案或未提交输入被替换前确认；新建也覆盖自动存档。正式模板未提供时显示空状态，不填充虚构方案。自动保存只监听浅引用的提交边界；启动先恢复，坏存档与外部修改暂停写入，提供备份、载入及明确覆盖。运行时结果、Trace、导航与草稿不持久化。

目标 Grid 使用 previewOperationState 的执行时点上下文和 targeting.ts 的资格，不使用最终目录。倒计时限定单目标提前／延后。同名参与者按稳定 ID 派生区分标签。不可达事件集中显示且保持锚点，无上下文禁用添加／编辑，保留删除与配置修复入口。错误诊断展开，普通警告可折叠。

EffectFields、ParticipantFields 和 TargetGrid 分别负责效果、实体与目标字段，OperationEditor 负责类型／阶段／名称和提交。统一 operationDraft 将新建普通草稿默认设为 postAction；编辑保留原阶段，隐式旧阶段仍按 preAction 处理。事件触发与战斗开始没有阶段选择。创建操作编辑锁定实体种类；字段错误关联实际输入，窄屏进入／退出编辑定位标题。

## 国际化职责

`src/locales/zh-CN.json` 与 `en.json` 维护完整自然语言模板。`SiteMessages` Schema 从中文消息结构推导，两个目录通过类型约束及 `validate:i18n` 的 Key／参数／格式校验保持一致。模型返回 MessageDescriptor 与原始参数；Presentation 注入轻量 t 接口，在 Vue Setup 中连接 useI18n，递归翻译嵌套描述并格式化数字。保留合理 ui.* Key，新消息按稳定业务语义分组。

官方名称来自规范化双语游戏数据；用户名称不翻译；自动名称不写入计划。语言只改变展示和数字格式；operationContext 以计划和选中锚点为依赖缓存，语言变化不重新预览执行状态。测试主要断言语义和业务身份，不锁定用户可维护的翻译措辞。详细维护步骤见 README。

## 图标与可访问性

Lucide 按名称导入，常用尺寸 18px、线宽 1.75；紧凑标记 13–16px，事件头像 22–28px。

| 语义               | 图标                |
| ------------------ | ------------------- |
| 提前／延后         | ArrowUp / ArrowDown |
| 速度／战斗事件     | Gauge / Timer       |
| 编辑／删除         | Pencil / Trash2     |
| 返回／添加         | ArrowLeft / Plus    |
| 立即行动／创建单位 | Zap / UserRoundPlus |

主要操作使用图标加文字；辅助图标按钮必须有 aria-label 和 Tooltip。阵营圆点保留 Tooltip 与可访问名称，不在行动卡上显示重复文字。行动卡选中态使用边框／背景和 aria-pressed，当前行动另以 aria-current="step" 表达，两者不叠加边框；不显示选中对勾，目标选择器继续保留 Check 与 aria-pressed。InputNumber 的错误关联通过 `pt.pcInputText.root` 传入实际 input，避免把 aria-describedby 留在外层 span。

UI 视觉和真实浏览器交互由用户在本地人工验收；Codex 默认仅执行类型检查、定向单元测试、静态检查和构建，不启动浏览器或截图。只有用户明确要求某次浏览器自动化验收时才例外执行。

避免紫色 Primary、Neon、玻璃拟态、多层卡片、装饰图标、满屏金色边框和常驻长说明。后续新增控件先检查 Token、键盘、浮层、双语与窄屏，再判断是否需要专属 CSS。
