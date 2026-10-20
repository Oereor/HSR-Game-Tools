# UI 设计规范

本指南描述首页、行动序列模拟器、跃迁模拟器与货币战争优化器当前使用的 UI 语言。机制与状态职责见[排轴架构](architecture/action-order-simulator.md)、[跃迁架构](architecture/warp-simulator.md)和[货币战争指南](currency-wars.md)，翻译维护见[Site Messages](site-messages.md)。
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

Warp 普通图片与货币战争的图片加载状态共用 [useImageSource](../src/composables/useImageSource.ts)。每个实例只记住最近失败的 URL，保持中性占位，其他 URL 可正常加载；Warp 演出另用本工具的 useWarpRevealSource 管理高清／轻量有序回退和就绪状态。资源映射、占位内容与业务状态仍由各工具维护，不建立全局图片缓存。

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

`/warp-simulator` 使用现有 Header、语言切换及黑金主题。顶部展示标题、当前卡池摘要和控制／历史入口；中央以结果展示为主。左右 PrimeVue Drawer 默认收起、互斥展开，宽度分别为 25rem／49rem 且不超过视口。单抽、十连、选择状态及星缘入口位于结果下方的 sticky 操作栏，收起控制仍可抽取，底部考虑 safe-area。

跃迁普通界面保留原深色布局、Surface、Drawer／Dialog、保底 Tag／Badge、InputText、Checkbox 与五列历史表格。仅通用操作按钮改用 HButton、卡池类别改用 HTabs，复用现有 astral-ui/components 与 scoped-theme.css；h-theme 只挂在按钮和页签本身。按钮保留原 ID、事件、Disabled、ARIA 和焦点锚点；单抽 secondary、十连 primary，ghost 文字沿用深色界面前景色。业务头像、卡池条目和结果卡按钮保留原实现。按钮图标排列与必要尺寸仅由 ui/controls.css 局部适配，不改变容器配色、字体或其他工具。历史分页及星缘／重置弹窗操作同样使用 HButton，其余界面恢复原样。

控制抽屉上方使用 pill HTabs，导航区可横向滚动，两侧 HButton 前后滚动，获得键盘焦点的页签自动进入可视范围。方向键及 Home／End 沿用 HTabs，idPrefix 连接原生 tabpanel，不启用内容高度动画，下方直接展示当前类别全部有效 Banner。类别顺序及本页记忆策略不变；每个卡池为完整按钮，当前选择同时具有整行背景、边框及左侧强调，不以头像稀有度边框代替选择状态。普通活动池只显示约 88px 五星头像和三个约 52px 四星头像，同一行排列；分别使用既有五星金／四星紫 Token，不显示名称及 UP 详情文字。Fate 只显示实际 UP，不生成四星占位；Ordinary 使用简短常驻入口，不伪造 UP。名称由 Presentation Adapter 取得，头像 Hover Tooltip 与整行 Focus Tooltip／ARIA 提供完整名称及稀有度，图片缺失沿用中性占位。

控制 Drawer 通过局部 PassThrough 保留 `clamp(16px, 4vw, 20px)` 标题／内容 inset，内容改为 `min-height: 0` 的 Flex Column，并关闭 Drawer 内容区默认纵向滚动。页签容器及当前原生 tabpanel 逐层允许收缩，仅中间卡池列表纵向滚动；页签导航不收缩。保底、星缘和两类重置组成 Tabs 外的底部控制区，不使用 sticky 或绝对定位。底部有轻量顶部分隔及安全区留白；最大高度为内容区的 65%，极矮视口或长错误提示时底部自身允许滚动，全部操作保持可达。页签外壳和导航仍沿用 Drawer 背景，不修改历史 Drawer 或全站主题。

保底按五星／四星分成两行，每行并列计数与保证状态。计数为 30px 等宽数字，使用已有五星金／四星紫 Token；标签 12px 弱化，保证沿用 Tag＋Check，普通灰色、大保底绿色，无 UP 为“不适用”。四星 9 显示 9+ 和待兑现说明，不改变引擎饱和值。抽屉状态独立于业务会话；从抽屉进入 Dialog 时先完成抽屉退出，再打开 Dialog，关闭后恢复原抽屉及触发项焦点。普通抽屉关闭返回顶部入口；直接打开星缘则返回常驻操作栏入口。

星缘区域保留标题和数量 Badge。已确认名单以七列 `minmax(0, 1fr)` 网格、4px 间距横向占满宽度，正方形头像不换行。每个头像均为带角色名称、Tooltip、键盘语义和焦点轮廓的按钮，打开同一个选择 Dialog；不再提供抽屉内的修改按钮。空名单显示整宽低对比度虚线按钮及半透明 Plus，不显示空头像或额外说明。保留必要的资格错误和存储提示，删除重置下方的会话存储说明。Dialog 关闭后优先恢复触发头像；加号被名单替换或原头像被手动移除时，恢复首个现存头像。页面常驻抽取栏的星缘按钮不变。

Dialog 标题旁的数量 Badge 未满七人为 secondary、恰好七人为 success；搜索标签仅对读屏保留。继续使用可搜索的双列头像 Checkbox 网格，≤480px 单列，支持中英文名和 ID；七名合法才可确认、取消丢弃草稿。不兼容的已选角色另列移除按钮，不能作为候选重新勾选。所有角色 Event／Fate 共用已确认选择，浏览器只保存该名单，保底和历史仍只属于页面会话；读写失败的简短提示不阻断内存选择。资格和存储契约见跃迁架构。

重置 Dialog 解释当前组／全部的实际范围，默认焦点落在取消；两种重置均保留共享星缘选择。抽屉使用 PrimeVue 的 Escape、焦点陷阱、遮罩及滚动锁，HTabs 保留键盘导航和原生 tabpanel 关联；真实键盘交互由维护者验收。

单抽和十连通过纯展示组件 `WarpResults` 共用横向卡片，约 2.1:1 外框。右侧 Metadata 区为 30%、最小 80px，横向 Padding 6px、纵向 8px，分隔线为稀有度色 14% 混色。内部是水平、垂直居中的紧凑两行信息簇：上行命途与角色属性，图标间距 8px；下行卡片专用裁切星级。光锥只渲染命途、自然居中，不保留空属性槽。十连图标目标 32px、两行间距 14px；单抽 40px／20px；行距不随卡片高度增长。UP 保持独立左上角叠层、11px，不参与布局。

Metadata 使用 inline-size 查询容器，内部可收缩 Grid 和 min-width: 0 约束固有尺寸；图标尺寸按两个图标加 8px 间距共同限制，光锥单图标不额外放大。`WarpVisualIcon` 的卡片模式采用各星级自然宽高比，目标高度十连 18px、单抽 23px；三档实际高度均取目标值与“容器可用宽度／五星裁切图宽高比”的较小值，不让五星先独立缩小。五颗星最大宽约 85.8px／109.6px，三星、四星保持相同单颗星尺度。原星级调用保留 5:1 显示，仅历史和详情继续使用；无父级 deep 固定宽高覆盖，卡片外层不裁切。

单抽最大宽 620px；十连桌面以八列 Grid 的双列跨度形成 3–4–3，保持实际顺序、等大卡片与每排居中。<1040px 降为两列，≤640px 为一列。网格统一行列间距 36px、内边距 24px；有结果时从标题向下自然排版，不用视口最小高度、弹性填充或垂直居中分配多余空间。空状态单独保留最小高度。结果标题 19px，来源／抽数辅助信息 13px，不改全站字体。

卡片仅常驻立绘／封面、命途、角色属性、原生星级图及可靠事件 UP。结果卡的角色图片使用 cover、统一 center 40% 定位；光锥使用独立内边距与 contain，保留完整封面。图片通过尺寸明确、可收缩的内部容器适配，不让固有尺寸撑开卡片。`WarpItemVisual` 的可选 crop 仅由结果卡启用；详情立绘继续 contain，头像模式不变，不放大头像代替立绘，也不按物品 ID 特判。名称、类型、稀有度、命途和属性由双语 Tooltip 与 ARIA 提供，整卡 PrimeVue Button 支持触屏、Enter／Space 打开共用详情 Dialog。历史来源、事件 UP、五星抽前保底数和记录编号也可在详情访问。

Warp 专属稀有度 Token 集中于 preset，结果卡与历史名称共用：三星蓝 `#6A8EB7`、四星亮紫 `#CE8FFF`、五星亮金 `#FFD17A`。三星蓝在历史 Surface `#22252b` 上达到约 4.51:1；名称不能通过 Hover 统一改成主题金色。外层卡片负责 2px 实色边框、4px 近光、柔和外光与轻内光；三档近光／外光混色比例为 20%／10%、80%／48%、100%／62%，外光半径／spread 为 16px／0、32px／1px、40px／2px，默认状态生效。卡片及结果网格保持 overflow visible，只有内部图片容器裁切；不能用全页 overflow hidden 掩盖溢出。Glow 不改变布局尺寸，不依靠 Hover，不引入倾斜、星空、Neon 或持续动画。新结果回到普通结果区后保留 180ms 淡入／上移 7px、逐张间隔 50ms；稳定批次／记录 key 防止语言、详情、图片状态更新重播，reduced-motion 关闭动画。

全屏结果演出使用独立 `WarpRevealOverlay` 与 `useWarpReveal`，只消费已提交的批次。单抽所有稀有度均演出；十连无五星直接展示结果，有五星则按原始顺序逐个演出，队列全部确认后才展示完整结果。五星 Identity 使用 V3 构图：实际物品的命途图标先淡入再降至半透明背景，五颗 StarBig 按外侧一对、内侧一对、较大的中央星依次短暂闪亮。六张图片或最终占位全部就绪后启动现有 1100ms 阶段，中央闪光完成后停留，再进入原 Artwork 淡入；三／四星单抽直接进入 Artwork。最终图片停留等待确认，前置信息点击仅跳到当前图片，加载／淡入期间的点击不推进。Escape 结束当前项、继续下一项，最后一项完成后返回结果；重复键盘事件及离场重复输入被忽略。

Identity 画布固定为 807:594，以命途图标的 160px CSS 显示上限除以 57% 约束画布最大宽度（约 280.70px），同时受容器宽高限制，整体等比缩放。命途宽 57%、中心 (50%, 52%)；五颗星中心依次为 (17.5%, 52%)、(30.1%, 52%)、(50%, 52%)、(69.9%, 52%)、(82.5%, 52%)，普通星宽 14.5%、中央星宽 34%。图标的完整透明画布保留，尖芒连接依照已确认原型；所有命途共用这套相对布局与 160px 显示上限，不用原图的 512／256px 分辨率或 DPR 决定构图大小；星星同步缩小，普通星最大约 40.70px、中央星最大约 95.44px，不单独限制星图尺寸。命途延迟 25ms、时长 287.5ms；外星延迟 260ms、内星 375ms，均播放 175ms；中央星延迟 505ms、播放 237.5ms，约 742.5ms 完成，停留至 1100ms。采用原型缓动与短暂发光，背景保持纯黑；动画实施证据见 [V3 动画报告](investigations/warp-simulator/phase-1m-five-star-reveal-animation.md)，尺寸修复与回归结果见 [Identity 尺寸修复报告](investigations/warp-simulator/phase-1m-identity-size-correction.md)。

演出背景、Dialog 外壳及全屏按钮始终纯黑 `#000000`，不使用主题遮罩渐变。`WarpRevealImage` 为当前演出项按需选择独立高清资源，失败依次回退轻量资源、中性占位；仅预加载当前 Artwork，不提前请求队列其他项。角色和光锥完整 contain、居中，显示范围同时受可用视口、原最大宽 1200px 和实际像素尺寸除以当前 DPR 限制，不为铺满屏幕放大低分辨率图。缩放／跨屏／视口变化时更新 DPR；轻量回退也按真实尺寸限制。普通结果卡与详情继续使用原轻量资源。使用 PrimeVue 模态、焦点陷阱及滚动锁，背景页面 inert、抽取入口锁定至 after-hide，再恢复发起抽取按钮焦点。Reduced Motion 在图片或最终占位就绪后直接等待确认，运行中启用时取消非必要动画。资源、语言与演出不消费 RNG，不改变历史或保底；状态机与生命周期规则见[跃迁架构](architecture/warp-simulator.md#全屏结果演出)。

最终 Artwork 使用 `WarpRevealMetadata` 提供三行左对齐信息：本地化名称、cardStars 裁切星级、命途 Icon＋名称及角色属性 Icon＋名称。面板定位于现有最大宽 1200px Artwork 舞台的左下角，不跟随实际图片外框，也不锚定 Viewport。黑色 75% 透明背景、16px Padding／偏移、8px 行距、6px 圆角，宽度 min(360px, 100% - 32px)；名称 26px／600 字重并使用既有稀有度色，星级高 22px，Metadata 图标 22px、文字 14px。命途中性色，属性直接使用 Adapter 的 elementTextColor。宽度 ≤640px 或高度 ≤480px 时 Padding／偏移 12px、最大宽 320px，名称 20px、星级高 18px、图标 20px、文字 13px。长名称完整换行，第三行可组间换行；缺少分组名称则省略该组，光锥无属性，两组均缺失显示本地化未知；缺图使用中性占位。

信息面板仅在 Artwork 就绪且当前显示阶段为 artwork／waiting 时挂载，随已有父容器淡入，并在最终 Artwork 离场时共同淡出；identity 和图片加载期间不显示。它不增加状态、计时器、ready 门控或焦点目标，pointer-events none 让点击继续由全屏按钮处理。按钮保留原名称与操作提示，aria-describedby 在面板出现时指向仅含稀有度和 Metadata 的本地化摘要，避免图标与相邻文字重复播报。规则及人工场景见 [Phase 1K 报告](investigations/warp-simulator/phase-1k-reveal-metadata-overlay.md)。

结果卡 Tooltip 使用转义文本的三行信息：名称（命途·角色属性）、稀有度、类别；只连接实际存在的元数据，光锥不显示属性。使用 PrimeVue Tooltip 的 text Pass Through 设置 white-space: pre-line，不插入 HTML；ARIA 及点击详情保留完整信息。

本地开发可打开 `/tests/manual/warp-results/index.html`，切换全三星、四星／五星混排、十连单五星、各类单抽和图片异常的固定场景，点击演出按钮复现同一正式状态机，并可模拟 Reduced Motion、检查同批历史。该独立入口复用正式结果组件、主题、双语与详情 Dialog，不注册正式路由、不进入生产构建入口、不调用引擎或保存会话。人工展示记录不能视为合法卡池结果；夹具继续以明确标识的合成身份复用封面检查样式，不修改正式数据。正式 Snapshot 已包含五星光锥，其展示由正式视觉目录提供；正式会话仍只消费真实引擎事件。Metadata 人工比较步骤见 [Phase 1J 报告](investigations/warp-simulator/phase-1j-metadata-layout-refinement.md)，高清演出见 [Phase 1I](investigations/warp-simulator/phase-1i-reveal-quality-fixes.md)。

历史使用五列语义表格，顺序为名称、类别、原生星级图、命途 Icon＋名称、属性 Icon＋名称。正文 14px、行高 1.6、单元格 Padding 12px／10px，名称按稀有度着色、弹性截断并提供完整 Tooltip；Hover 使用下划线，Focus 保留同色清晰轮廓。其余列宽稳定，表格最小宽 720px，光锥属性留空。属性文字保留来源色，必要时最小幅度混白，确保在 `#22252b` Surface 上至少 4.5:1。历史容器自身横向滚动，不拆成纵向标签；顺序、每页 25 条和最近 1000 条限制保持不变。

图片及 Icon 加载失败使用中性占位和语义标签；不猜测 URL。仅播报简短抽取完成通知，不将历史放入 live region。资源维护见[游戏数据指南](game-data.md#warp-展示资源)。

## 货币战争优化器

`/currency-wars` 保留网站 Header 和背景，配置／结果各使用一个 Astral UI 浅色 HPanel。桌面左栏 340px，960～1099px 为 300px，低于 960px 单栏。桌面宽 ≥960px 且高 ≥640px 时，本页 :has 条件限定的外壳 Grid 使用 100dvh 自动分配 Header 及内容高度；页面和面板使用 Flex 与 min-height:0 逐层传递剩余高度，双栏等高。较矮桌面及单栏允许整页滚动，每个面板为 max(30rem,70dvh)。不修改公共布局；vendor 仅扩展 HModal 的主题属性透传、本地化关闭标签和离场清理接口，并维护来源补丁与哈希。依赖使用仓库内源码包；只导入无主题组件入口与局部主题，`.h-theme` 之外不设置根变量、字体、焦点或滚动条规则。详情 HModal 的 Teleport 遮罩根节点显式标记局部主题。

左栏使用目标任务／设置两个 pill Tabs。任务页使用 icon="search" 的 HInput 与同排等宽 HButton 全选／清空，按钮使用 check／cross 图标，清空为 danger，操作覆盖全部任务；25 个任务以带图标的 Switch 展示，按稳定任务 ID 即时选择，初始全部关闭，开始禁用，用户可全选；已选数量置于搜索上方，列表 HFadeContainer 填满剩余空间，仅列表滚动并上下渐隐；设置独立滚动，操作 Footer 固定不随 Tab 改变。数量提示简短，取消任务弹窗、逐条移除和确认草稿。两个数量滑块允许 1～13 槽、12～39 枚星徽，默认 13／18；专家 Checkbox 默认关闭。设置顺序为槽位、预算、专家、优化目标；底部同名 HRadio 在 fieldset 内选择少人（默认）／少星徽，配置改变仅标记旧结果过期。网页请求固定 60 秒，无时限控件和规则说明。底部主要 HButton 保留开始、Loading、取消及错误反馈；默认插槽使用实心 Lucide Play，图标与文字整体居中，Loading 时仅显示库自带 Spinner。

结果使用 HTabs／HTabPanels 切换推荐阵容、羁绊详情、星徽需求，始终共享一个结果；配置栏及结果栏启用原生切换和高度动效，新有效结果返回推荐阵容并关闭旧详情。Header／Tabs 固定，内容使用带 Tab key 的 HFadeContainer 填满剩余空间，上下渐隐、自动溢出检测，切换从顶部开始；内容少时保留空白。删除各 Tab 重复标题和通用配方说明。阵容复用原角色卡和费用 Token，卡片 128px、窄屏 104px、左对齐自动换行，保留等宽三个星徽槽。详情复用 HModal 的 illustration、title、默认内容、footer；左侧圆形头像、实际形态费用与站位，右侧按稳定 ID 去重排序的 finalTraits、实际佩戴星徽和特殊机制，无区域标题或嵌套 Card，以细线分隔。无星徽显示 —，不绘制空槽；底部仅一个带 cross 的关闭 HButton。窄屏上下排列，正文内部滚动，Footer 不收缩。

结果 HPanel 的 action 插槽显示紧邻标题的绿色任务完成数 HBadge，使用展示结果及其请求，跨 Tab 常驻；删除使用星徽摘要。羁绊详情使用紧凑并集列表，依次显示未激活目标、已激活目标、其他已激活羁绊；按真实激活门槛分组，目标任务完成状态单独保留。左侧第一行用 CurrencyTrait 显示图标与名称，人数紧随其后，16px／600／等宽数字；目标显示实际／要求，多任务保留全部门槛，其他仅显示实际人数。第二行与名称对齐，用 success Badge 标记目标任务，未激活目标用 muted Badge 替代未完成状态，已激活目标逐项显示完成／未完成；低门槛完成信息仍保留。右侧贡献头像常驻、32px、4px 间距、靠右对齐，直接使用实际 formId 的目录费用和既有 --p-currency-cost-* 颜色；空间不足时换行，不折叠或横向溢出。姓名通过 title、替代文本和 ARIA 访问。星徽需求直接迁至第三页，保留全部合法配方及「或」分隔，无配方显示 —，不合计材料。

白色单色羁绊图片按资源种类局部转深，彩色头像、星徽及材料保持原色。角色卡名称下复用小字次级区显示开拓者前后台、领航员真实目标及无目标状态、布洛妮娅已确认羁绊或平局未归属；底部机制折叠区移除，详情弹窗显示真实目标头像及费用、布洛妮娅确定归属或未归属状态，平局警告保留；技术性求解详情不展示，底层诊断字段不删。可行但未证明最优、失败、取消、过期及历史结果使用简短反馈。自然语言和 ARIA 进入双语消息，本页 HButton 启用星光效果，HModal 使用原生进出场与页脚动效；所有动画遵守系统 Reduced Motion 和 data-h-motion 设置。弹窗退出后释放滚动锁、恢复焦点并清除选择，快速重开不被旧退出回调清理。功能和人工验收清单见[货币战争指南](currency-wars.md)。

## 维护与验收

保持克制的黑金风格，避免紫色渐变、Neon、玻璃拟态、多层卡片、满屏金色边框和长篇常驻说明。
新增控件先检查 Token、键盘、浮层、双语与窄屏；数学、资格、持久化及版本规则以现行架构为准。
用户在本地人工验收视觉与交互；Agent 的验证政策及建议宽度见[开发指南](development.md#验证策略)。
