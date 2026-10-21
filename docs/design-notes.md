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

结果展示使用单件揭示、十连全屏总览和主页面常驻结果区。全屏由同一个 PrimeVue Dialog 承载，角色／光锥 Artwork 和十连总览共用 `WarpResultBackground`：顶部近黑深蓝、中部蓝紫、下部灰蓝、底部浅灰白，渐变 Token 集中在 preset 的 warpResult；装饰只使用少量静态星点和光柱。五星 Identity 前置阶段继续纯黑背景，保留已验收的 V3 构图、1100ms 时序和图片就绪门控。

单件角色使用中央偏右的完整高清 character_portrait、左侧约 38% 宽的紧凑 Metadata 渐隐条；名称、裁切星级、命途和角色属性完整显示，长名称允许换行。光锥使用独立 lightConePreview；透明素材自带倾斜与叠层边框，仅补阴影，不额外透视扭曲。二者完整 contain，继续受实际像素／DPR 上限限制。当前锁定预览仅 348×408，按维护者选择优先原生清晰度，单件光锥因此小于游戏参考图。窄屏将完整主体放在上部、Metadata 放在底部，保留点击继续和 Escape。

十连使用 `WarpResultsWall` 和独立的几何模型，横向 2:1 卡片按原始抽取顺序形成斜向 3–4–3。逻辑卡片 320×160，逐卡 −12° 旋转，横向中心间隔 348、排间隔 250，并沿倾斜基线错位。整体包围盒包含每张旋转后的卡片和 48px 发光安全区，按可用宽高等比缩小，完整显示十件物品；不直接旋转旧网格。宽度 <1040px 或高度 <640px 改为可滚动双列，≤640px 单列，轻微旋转分别为 −4°／−3°。标题与明确关闭按钮不随卡片墙滚动。主页面继续保留本批结果，使用普通响应式网格复用相同卡片。

卡片左侧为约 30% 的命途／角色属性与 cardStars 信息簇，右侧为美术主体。光锥只显示命途，无空属性槽；使用透明 preview 居中 contain，失败回退原 Artwork 和中性占位。角色使用完整画布的轻量 character_portrait，按独立 PortraitFocus 配置裁切。图像容器显式使用 minmax(0,1fr) 和 min-width／min-height:0，避免原图固有高度撑开 Grid。UP、转义文本 Tooltip、ARIA 和详情入口保留，不增加“新”、资源结算或转换奖励。

PortraitFocus 的 x／y 是未裁切源画布的归一化头部坐标，scale 为 cover 基础缩放倍率。默认 (0.5,0.3,2)，覆盖键使用 canonical 角色 ID。内部图片通过计算宽高与 left／top，将头部映射到卡内美术区中心，外层旋转不参与计算。首次人工校准昔涟、真珠、布洛妮娅、黑塔、青雀、希儿、克拉拉、米沙，并补充三月七和姬子；其余角色暂用默认值。缩小后的完整画布复用同一坐标，头像图片不使用此配置。校准数据仅属于展示层，不写入业务快照。

稀有度继续共用 preset 的三星蓝 #6A8EB7、四星紫 #CE8FFF、五星金 #FFD17A；卡片边框、近光、外光和内光保持分级。外框不裁切发光，只有卡内图片裁切。名称和 Tooltip 保持可读，图片失败不影响关闭。稳定 batch／entry key 避免语言、详情及图像状态变化重播；系统 Reduced Motion 关闭非必要动画。

V3 Identity 保持 807:594 画布、160px 命途 CSS 上限与同步缩小的五颗 StarBig。命途中心 (50%,52%)、宽 57%；五颗星中心横向 17.5%、30.1%、50%、69.9%、82.5%，普通星宽 14.5%、中央星宽 34%。命途延迟 25ms／287.5ms；外星 260ms、内星 375ms，均播放 175ms；中央星 505ms／237.5ms，结束后停留到 1100ms。六张图片或占位全部就绪再启动；相关实现和历史验收见 [V3 动画报告](investigations/warp-simulator/phase-1m-five-star-reveal-animation.md)。

本地开发入口 `/tests/manual/warp-results/index.html` 复用正式状态机、背景、卡片和详情内容，覆盖固定单抽、十连、图片异常和双语场景；合成身份只留在测试图中。新增开发专用校准器支持角色选择、原图点击头部、x／y／scale 实时调整、正式卡片预览和 JSON 导出；不注册生产路由，不保存生产配置。真实浏览器检查和待人工验收项见 [结果展示重构报告](investigations/warp-simulator/result-display-refactor-2026-10-20.md)。

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
