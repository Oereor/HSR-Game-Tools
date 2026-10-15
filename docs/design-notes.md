# UI 设计规范

本指南描述首页、行动序列模拟器与跃迁模拟器当前使用的 UI 语言。机制与状态职责见[排轴架构](architecture/action-order-simulator.md)和[跃迁架构](architecture/warp-simulator.md)，翻译维护见[Site Messages](site-messages.md)。
历史 UI 取舍和验证记录保存在 [investigations](investigations/README.md)，不作为当前阶段状态说明。

## 主题与组件职责

主题入口为 [preset.ts](../src/theme/preset.ts)，使用 PrimeVue Styled Mode 的 `definePreset(Aura, …)`。
依赖版本以 [package.json](../package.json) 为准，保留现有 PrimeVue / @primeuix/themes 组合，不重新引入 @primevue/themes。
优先 Primitive / Semantic Token，只为必要组件定制 Token；Aura 深色覆盖位于 `colorScheme.dark`，保留对应层级。

| 语义               | Token / 当前值                    | 用途                              |
| ------------------ | --------------------------------- | --------------------------------- |
| 页面               | graphite.950 / `#17191D`          | 页背景与工作区基底                |
| 次级 Surface       | graphite.900 / `#22252B`          | 控件与业务卡片                    |
| 浮层               | graphite.800 / `#2B2E34`          | Tooltip 等轻浮层；Dialog 使用 900 |
| 主文字             | graphite.50 / `#F1EEE7`           | 正文与标题                        |
| 辅助文字           | graphite.400 / `#969AA3`          | 简介、状态和次级信息              |
| 强调               | gold.400 / `#C9A86B`              | 主要操作、选择与 Focus            |
| 边框               | graphite.700 / `#3B4049`          | 分隔和卡片边界                    |
| 提前 / 延后 / 友方 | `#5FA9E7` / `#E16B71` / `#67BD96` | 对应机制和阵营，不作首页装饰      |
| 中立 / 事件 / 系统 | event.500 / `#DFBC66`             | 阵营圆点及系统身份                |

深色 Primary Hover / Active 使用 gold.300 / 200，文字使用 graphite.950。Highlight 为金色低透明背景。
Focus Ring 为 2px、offset 3px；普通控件圆角 6px，业务卡片 6–8px。普通输入不常驻金色边框。

[main.ts](../src/main.ts)固定 `.app-dark` 在 html；PrimeVue 与 Tailwind 使用同一 selector。CSS 层顺序为 theme → base → primevue → components → utilities，body Portal 继承主题 Token。
[main.css](../src/assets/main.css)提供主题颜色和公共业务样式；首页独立 Scoped CSS，不用宽泛全局选择器影响模拟器。

PrimeVue 负责基本控件、Tabs、Dialog、Tooltip 和 Splitter；工具自身负责布局、行动卡、操作卡、头像与语义标识。
不让 PrimeVue Card 决定信息架构，不批量覆盖内部 `.p-*` 类、不全量注册图标，也不加入新 UI 框架。

## 首页工具集合

[HomePage.vue](../src/views/HomePage.vue)复用 Header、站名和语言切换。Hero 只有标题与次级 GitHub 链接；工具区使用统一 Icon / 名称 / 简介，Footer 为低调的非官方声明。

站点内容最大宽度沿用 1440px，卡片内边距 24px、圆角 8px、最小高度 240px，由内容自然撑开；图标为 24px，置于 48px 的低对比容器。
大于 1100px 三列，601–1100px 两列，600px 及以下单列；移动端 GitHub 链接位于标题下方，网格与文本允许收缩、换行。

开放卡片使用整卡 RouterLink、轻金色边框及右下角箭头，Hover / Focus 轻微提高背景和边框对比；150ms 过渡，不缩放或发光。
未开放卡片使用静态 article，保留正常可读性，无点击、箭头、Tab 焦点或伪路由。状态由工具目录的路由决定，不由翻译文案决定。
尊重 `prefers-reduced-motion`，关闭过渡与箭头位移。

## 模拟器工作区与编辑

桌面以约 35% / 65% Splitter 分栏，根据最小宽度调整；Navigator 至少约 320px，Inspector 约 440px，计算包含 gutter。
低于 960px 改为上下布局，Navigator 最大 280px，Inspector 随页面展开；桌面两侧分别滚动，不添加第三个工作区滚动容器。

战斗配置依次呈现方案管理、我方编队、阿哈配置（适用时）、敌方单位与推演范围。敌方小卡桌面双列、窄屏单列，名称允许重复，SPD 由用户输入。
阿哈标题用紧凑 UnitPortrait Smile 和黄色中立点；基础速度输入与只读面板速度双列，600px 及以下单列。基础速度可修改，预览来源与隐藏状态保留规则见架构文档。

概览和编辑互斥，操作编辑占用 Inspector；退出或切换时按架构中的草稿规则处理，窄屏定位编辑标题。
不可达事件保留配置修复入口；无可靠执行上下文时禁用新增 / 编辑目标操作，保留查看 / 删除。错误诊断展开，普通警告可折叠。
离场 / 重新入场复用 SelectButton 和目标头像 Grid，按执行时点筛选在场 / 离场单位；离场单位虽从队列隐藏，仍能在回场选择器中访问，不增加单位总览面板。
事件速度表单支持可选百分比基数；速度目标包含事件时仅提供无限持续，既有不支持配置明确报错。卡厄斯兰那从现有预设 Popover 进入紧凑参数表单，基础速度、继承比例和初始速度预览同处 Inspector；缩略图复用白厄快照资源与既有 Fallback。取消不写入方案，确认一次提交全部节点。

## 行动卡、队列与操作卡

未来行动上方弱化显示推进 AV，下方突出累计 AV；当前队列顶部突出当前行动者（0.00 AV），等待项显示剩余 AV 和有效 SPD，控制栏显示累计 AV。
数字右对齐并使用 tabular numbers。展示时点来自架构规定的初始 Snapshot / beforeEffects，不读取未来结果来补充当前状态。

行动卡以 9px 阵营圆点、名称与回合信息组成主体；绿色我方、红色敌方、黄色中立 / 事件 / 系统 / 未知，圆点带本地化 Tooltip 和可访问名称，不重复常驻阵营文字。
长名称截断并保留完整 title；Inspector 名称可换行。

选中行动卡通过边框 / 背景和 aria-pressed 表示；当前行动另用 aria-current="step"，避免叠加边框，不加选中对勾。
系统轮次使用黄色圆点和 Flag，显示累计 / 推进 AV，不显示 SPD 或普通回合编号。当前边界置顶，等待区不重复显示它；停用轮次配置单独列出。

操作卡按实际窗口分组，Padding 12px，Metadata 正文约 13px；右上角保留上移、下移、编辑、删除四个 PrimeVue 图标按钮。
名称优先自定义，否则翻译语义描述；参数始终来自配置与缓存执行上下文，不根据标题推断或省略。
单目标显示头像和名称，多目标预览四个头像并用 +N Popover 提供完整名单；无可靠上下文时显示范围 / 不可解析状态，不虚构目标。

## 行动变化标记与速度 Tag

ArrowUp（蓝）、ArrowDown（红）、Zap（蓝）分别表示 advance、delay、immediatelyAct，三种类型可共存。
仅使用匹配目标 Anchor 的已提交 Trace；合法效果即使 AG / AV / 排序不变也显示，零百分比保留，不按净变化相互抵消；无效 / 跳过 / 失败效果不产生标记。
中性的配置图标只表示该节点配置了操作，不能代替受影响标记；速度变化不生成拉条标记。

速度 Tag 展示实际生效的 Modifier，每个实例独立，不合并；正值蓝、负值红、零值中性，文字保留原始 flat / percent 幅度与符号。
阿哈只展示自身 Modifier，派生贡献不伪装为 Buff。Tooltip 解释剩余回合、无限持续或关联倒计时名称和速度；不能从草稿或未来配置推断当前效果。
Scheduled Event 的自身 Modifier 使用相同 Tag，Inspector、当前队列与未来节点均读取实际时点。关联倒计时已有 Modifier 时，其速度提示使用当前有效速度。

行动卡第三行仅在有 Tag 或变化图标时出现；Tag 左侧换行，变化图标保留在右侧 AV 下方。
复用小尺寸、柔和背景的 PrimeVue Tag，不加入内部图标。Inspector 和 Navigator 共用来源索引与纯展示模型，无法解析倒计时时使用通用文案，不猜到期。

## 图标与可访问性

Lucide 按名称导入，常用尺寸 18px、线宽 1.75；紧凑标记 13–16px，事件头像 22–28px。
首页 GitHub 本地 SVG 的来源与通知见[第三方说明](third-party/README.md)。

| 语义                | 图标                       |
| ------------------- | -------------------------- |
| 提前 / 延后         | ArrowUp / ArrowDown        |
| 速度 / 战斗事件     | Gauge / Timer              |
| 编辑 / 删除         | Pencil / Trash2            |
| 返回 / 添加         | ArrowLeft / Plus           |
| 立即行动 / 创建单位 | Zap / UserRoundPlus        |
| 离场 / 重新入场     | LogOut / LogIn             |
| 阿哈 / 轮次         | Smile / Flag               |
| 工具目录            | ListOrdered / Ticket / Gem |

主要操作使用图标加文字；辅助图标按钮具有本地化 aria-label 和 Tooltip，纯装饰图标隐藏于辅助技术。
目标选择保留 Check 和 aria-pressed，合法名单完整可达。表单错误关联真实输入；InputNumber 通过 `pt.pcInputText.root` 传递 aria-describedby。

行动卡按钮内不嵌套按钮或可聚焦 Tag。Tag 支持 Hover Tooltip；卡片 Focus Tooltip 与可访问名称包含全部效果，Inspector 的非交互包装元素可聚焦解释同一效果。
Tooltip 使用转义文本并保留 Escape 关闭，效果含文字和符号，不仅依靠颜色。

## 跃迁模拟器

`/warp-simulator` 使用现有 Header、语言切换及黑金主题。≥1040px 为约 40%／60% 两栏，左侧至少 320px；更窄时上下排列。左栏只有一层配置 Surface，右栏结果与历史用留白、标题和分隔线分组，不堆叠装饰卡片。

左栏依次为 Banner Select、当前 UP、固定四行保底、适用时的星缘入口、单抽／十连按钮及次级重置入口。小保底为 secondary Tag 加灰色 CircleCheck，大保底为 success Tag 加绿色 CircleCheck，无 UP 显示“不适用”。四星饱和值显示 9+ 及待兑现说明，不能展示为精确累计次数。

星缘 Dialog 使用可搜索的双列头像 Checkbox 网格，≤480px 单列；支持中英文名和 ID，显示已选数量，七名确认、取消丢弃草稿。搜索与 Checkbox 的说明关联真实输入；选项名称截断但 title 与标签保留全名。重置 Dialog 解释当前组／全部的实际范围，默认焦点落在取消。

单抽结果为最大约 320px 的卡片，十连通过八列 Grid 的双列跨度形成 3–4–3，≤640px 两列。保持抽取顺序，显示名称、星级文字、命途和角色专属属性；五星使用现有金色 Token，四星用较亮中性色，三星弱化。头像使用 contain，缺图用统一的 UserRound／BookOpen 中性占位，不扩大低分辨率资源冒充完整立绘。

新批次结果卡淡入并上移 7px，180ms 完成，每张间隔 50ms；整体只做短暂入场，不缩放、闪烁或发光。稳定的批次／条目 key 使语言、切池和分页不会重播；prefers-reduced-motion 关闭动画。业务提交不依赖动画完成。

历史为紧凑列表，最新优先，每页 25 条，显示名称、星级、命途／可选属性、事件 UP 及来源。页面说明仅保留最近 1000 条且离开后清空。使用简短 aria-live 完成通知，不将完整历史放入播报区。分页图标按钮具备 Tooltip 和 aria-label。

## 维护与验收

保持克制的黑金风格，避免紫色渐变、Neon、玻璃拟态、多层卡片、满屏金色边框和长篇常驻说明。
新增控件先检查 Token、键盘、浮层、双语与窄屏；数学、资格、持久化及版本规则以现行架构为准。
用户在本地人工验收视觉与交互；Agent 的验证政策及建议宽度见[开发指南](development.md#验证策略)。
