# HSR-Game-Tools Design Notes

Phase 1B-0，本地交互原型。独立于 HSR-Database 的样式体系。

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

Navigator AV 固定两位，内部数值不四舍五入。箭头直接来自固定引擎 Trace，只表达提前／延后，不显示变化幅度。长名称截断且保留完整 title，Inspector 名称允许换行。

操作卡标题表达类型，数值单列强调，目标以小头像／名称显示，结算阶段是次级标签。事件名称只出现一次；速度生命周期单独展示，不机械拼接所有 Metadata。

概览和编辑互斥。节点或阶段切换丢弃草稿；取消不改变已提交操作。数据均为页面局部状态，没有存储／导出。PrototypeOperation 不等同于 EffectOperation；原型提交不改变固定引擎结果。

## 图标与可访问性

Lucide 按名称导入，常用尺寸 18px、线宽 1.75；紧凑标记 13–16px，事件头像 22–28px。

| 语义                   | 图标                              |
| ---------------------- | --------------------------------- |
| 提前／延后             | ArrowUp / ArrowDown               |
| 速度／战斗事件         | Gauge / Timer                     |
| 编辑／删除             | Pencil / Trash2                   |
| 返回／添加             | ArrowLeft / Plus                  |
| 后续立即行动／创建单位 | Zap / UserRoundPlus（本轮未实现） |

主要操作使用图标加文字；辅助图标按钮必须有 aria-label 和 Tooltip。阵营有文字，选中节点和目标有勾选标记及 aria-pressed，不能只靠颜色。InputNumber 的错误关联通过 `pt.pcInputText.root` 传入实际 input，避免把 aria-describedby 留在外层 span。

避免紫色 Primary、Neon、玻璃拟态、多层卡片、装饰图标、满屏金色边框和常驻长说明。后续新增控件先检查 Token、键盘、浮层、双语与窄屏，再判断是否需要专属 CSS。
