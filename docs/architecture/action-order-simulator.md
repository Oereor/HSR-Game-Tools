# 行动序列模拟器架构

本文描述当前已实现的行动序列模拟器 / Action Order Simulator。内部目录、类型和 `/action-planner` 路由保留 Action Planner 标识，不随产品名称迁移。
UI 展示见[设计规范](../design-notes.md)，文案见[Site Messages](../site-messages.md)，实施演进见[历史索引](../investigations/README.md)。

## 职责与数据流

工具业务集中在 `src/tools/action-planner/`：engine、model、composables、components、data、templates 与页面入口各自保持原职责。仅排轴使用的 GameIcon 随工具组件维护；全站 Router、i18n、主题、通用 UI 和 `public/game-assets/` 保持共享。工具之间不直接引用对方业务内部实现，数据维护脚本仍在 `scripts/`，不进入运行时引擎。

[纯 TypeScript 引擎](../../src/tools/action-planner/engine/)进行有限预算的离散事件推演，不依赖 Vue、Router、DOM、Node 文件系统、翻译或原始游戏 JSON。
它执行用户显式配置的操作，不解析技能描述或自动执行完整角色技能。

数据流为：配置或操作草稿 → 显式提交 PlannerDocument → simulatePlan 重放 → SimulationResult → Navigator / Inspector / Presentation。
[useActionPlanner](../../src/tools/action-planner/composables/useActionPlanner.ts)持有页面唯一已提交文档，结果为独立的浅引用派生值；仅方案名或自定义操作名变更不重新推演。
运行时结果、诊断、Trace、队列和执行预览不是另一份业务配置。

## 时间、速度与队列

数学与排序来源为 [queue.ts](../../src/tools/action-planner/engine/queue.ts)、[engine.ts](../../src/tools/action-planner/engine/engine.ts) 和 [operations.ts](../../src/tools/action-planner/engine/operations.ts)。

- 完整行动距离 `FULL_AG = 10000`，剩余行动值 `remainingAV = remainingAG / effectiveSpeed`；速度必须为有限正数。
- Actor 的有效速度为面板速度，加自身固定速度修正和基于 baseSpeed 的百分比修正。速度变化保留当前 AG，不按新速度重置距离。
- Scheduled Event 的有效速度为 `speed + (baseSpeed ?? speed) × 百分比修正合计 / 100 + 固定修正合计`。speed 是初始实际速度，baseSpeed 是独立百分比基数，百分比效果相加而非复利。
- 推进一段时间前冻结所有单位的区间速度，按 `deltaAV × speed` 扣减 AG；只归零减法舍入残差，不使用 AV epsilon 改变事件排序。
- 按剩余 AV 排序；相等时，零 AG 单位先比较零 AV 插入批次（新批次优先），同批次按操作前队列顺序，最后按稳定入队 order 排序。
- 默认预算为 60 节点 / 600 AV，硬上限为 500 节点 / 100000 AV。自然行动、单次事件和轮次边界均计入节点预算；开始操作不作为一个事件节点。

所有内部计算保留原始精度；展示取舍见 Site Messages 的数值格式规则。

共享运行状态 `departed` 默认 false。离场单位仍存在于完整 participants 中，但不参与队列排序或 AG 消耗；保留 ID、AG、零 AV 优先级、待展示 Trace、回合和 Modifier。回场仅恢复调度，`AG_return = AG_departure`，剩余 AV 按当前有效速度重新计算；不调用立即行动、不生成 Trace、不增加回合数。
正在自然行动的单位在 preAction / postAction 离场，当前回合仍完整结算，其 AG 重置、Buff 到期和行动次数限制沿用自然回合流程；离场操作本身不改变这些数据。

## 行动单位与系统事件

类型定义见 [types.ts](../../src/tools/action-planner/engine/types.ts)。

| 类型                        | 当前行为                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Actor                       | 我方或敌方自然行动单位，有 baseSpeed / panelSpeed、回合数和自身 Modifier；可设置自然行动次数上限   |
| Scheduled Event             | 有初始速度、可选百分比基数和自身 Modifier 的单次倒计时，触发后移除；也用于效果到期计时，无自然回合 |
| Aha Participant             | 中立自然行动单位，有独立 AG、回合和自身 Modifier，速度由配置与存活贡献者派生，不占初始编队槽位     |
| Cycle Boundary System Event | 轮次边界，独立于 Participant，不具有 SPD、AG 或目标资格，不进行自然回合结算                        |

初始配置允许 0–4 名我方和 0–5 名敌方，双方位置分别编号；此限制不用于动态生成的单位。
通用创建操作只支持 Actor / Scheduled Event，不能手动创建 Aha 或轮次系统事件。

## 操作与目标资格

| 操作             | 当前效果                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| advance          | 扣减 `FULL_AG × percent / 100`，剩余 AG 不低于 0；正比例拉至零时参与零 AV 插入 |
| delay            | 增加同尺度 AG，可使距离超过 FULL_AG                                            |
| immediatelyAct   | 将目标 AG 置为 0，并按操作前队列顺序形成新的零 AV 批次                         |
| depart           | 将在场参与者设为离场，冻结其 AG，保留身份、排序元数据与效果                    |
| returnToField    | 将离场参与者重新入场，以当前速度计算剩余 AV                                    |
| addSpeedModifier | 添加固定值或基础速度百分比修正，使用有限 / 无限回合或共享倒计时生命周期        |
| spawnParticipant | 以操作 ID 派生稳定 ID，创建 Actor 或单次 Scheduled Event                       |

资格统一由 [targeting.ts](../../src/tools/action-planner/engine/targeting.ts)判定。Actor 可接受上述目标操作；Aha 接受速度与离场 / 回场。普通效果及 depart 选择在场单位，returnToField 选择离场单位；operationTargets 读取真实 SimulationState 并按操作类型筛选，不能使用最终定义目录判断在场状态。
我方 / 敌方群体仅选对应阵营且状态匹配的 Actor，不包含 Aha 或事件。显式 Presence 多选可混合三类参与者；其中任一目标缺失或状态不匹配时整条操作跳过并诊断，不部分提交。
Scheduled Event 可作为单个显式目标接受 advance / delay，不能接受立即行动；速度效果支持显式单选、多选及与 Actor / Aha 混选，但包含事件的操作只接受 `{ kind: 'turns', turns: null }` 无限持续。有限回合或倒计时持续在校验及运行时均拒绝，不静默转换。
正在触发的 Scheduled Event 保留在状态中用于结算和诊断，但不再可选；离场事件没有触发，因此仍可被 returnToField 选中。

当前正在行动的自然单位不进入拉条操作的可排序队列；对当前行动者的此类配置产生 active-target 提示，不改变其当前行动。速度效果仍以当前状态资格处理。
缺失或不合格目标产生诊断并跳过该操作；速度候选状态必须保持合法，速度 Modifier 与其倒计时创建一起提交。

自然行动采用 preAction → 回合推进及 AG 重置 → postAction → 回合到期与退出的顺序。
普通新建草稿默认 postAction；编辑保留原阶段，旧操作未显式指定 phase 时使用 preAction。开始、单次事件与轮次边界只有一个不带 phase 的操作窗口。
立即行动仍执行普通自然行动流程，不自动代表游戏中的额外回合规则。

## 生命周期与轮次

自然行动开始时记录已有 Modifier ID；在完整 postAction 结束后，仅这些原有效果的有限回合数递减。
该回合中新添加的效果不会立即扣一回合；无限回合不递减。只有 Actor 达到 actionLimit 后退出，Aha 没有该退出限制。
离场期间没有该单位的自然回合，因此回合 Buff 不随其他单位行动扣减。关联倒计时仍在场时正常触发并移除离场目标上的到期 Buff；倒计时自身离场则冻结 AG，回场后继续。事件自身的速度 Modifier 无限持续到事件移除，事件不增加回合计数器。

Scheduled Event 触发时，先移除与它关联的到期 Modifier，再记录 beforeEffects 并执行事件操作，最后移除事件自身。
到期后出现非法速度会停止该节点，不允许后续操作掩盖失败。回合或倒计时到期均不自行重置 AG 与零 AV 插入优先级。

[轮次规则](../../src/tools/action-planner/engine/cycle.ts)支持 none / moc / aa：第 0 轮长度分别为 150 / 300 AV，此后每轮 100 AV；第 n 个边界（n ≥ 1）为首轮 AV + 100 × (n−1)。
同一 AV 下先处理 Actor、Aha、Scheduled Event 及它们新产生的零 AV 行动，每次结算后重新检查队列，最后处理轮次边界。
边界自身产生的零 AV 行动在该边界结算之后执行。轮次不重置 AG、不递减自然回合 Buff；没有参与者时不继续推进到未来边界，但已经到时的边界仍可结算。
所有我方 Actor 离场不阻止其他单位或倒计时继续调度。全体参与者离场时，已启用且预算内的轮次系统节点仍可推进；无可调度参与者且无有效系统节点时按空调度停止，不虚构回场节点。

轮次操作绑定 `{ kind: 'cycleBoundary', ordinal }`。关闭模式保留为停用配置，不算普通不可达警告；重新启用或切换 MoC / AA 继续按 ordinal 关联。
尚无跨波次重置、保留规则或自定义轮长。

## 阿哈时刻

[身份解析](../../src/tools/action-planner/model/aha-config.ts)依据规范化角色形态的 Elation 身份识别初始我方贡献者；引擎只读取 `aha: { id, baseSpeed, contributorIds }`，不访问游戏数据。
有初始贡献者时创建 Aha；配置始终保留，即使 UI 暂时隐藏。

默认基础速度为 80，可在战斗配置中修改。有效速度为：自身 baseSpeed + 存活贡献者有效速度降序前四名分别按 1/5、1/10、1/20、1/40 加权 + 自身 Modifier。
百分比 Modifier 只基于 Aha baseSpeed，不基于派生面板速度。贡献不生成 Modifier；行动中的贡献者仍计算，移除参与者后停止贡献，Aha 不因贡献者全部移除而消失。
离场保留贡献者身份，离场贡献者的当前速度仍计入阿哈；仅真正移除参与者（如达到 actionLimit）停止贡献。

Aha 与 Actor 共用自然回合、回合 Buff 与倒计时到期规则。它不能被提前、延后或立即行动；自身变速不生成拉条 Trace。
配置面板的只读速度使用草稿编队，尚未计入开始操作；Apply 将编队、预算、轮次与阿哈一并提交，并保留 Aha ID。

Version 3 起，方案保存的贡献者 ID 是身份事实。导入保留这些 ID，明确 Apply 编队时重新识别已知身份。未知且未改变的身份保留已有事实，并报告资源问题。
额外阿哈时刻、欢愉技、笑点和技能自动触发未实现；“持续到阿哈时刻结束”当前按一个自然回合近似处理，不宣称完整复现游戏机制。

## 编辑状态与展示时点

[PlannerDocument](../../src/tools/action-planner/model/editor.ts)包含 `name`、`plan: SimulationPlan` 和 `metadata: { customNames, characterIds }`。计划编辑重放引擎，显示名称编辑不改变数学结果。
战斗配置为独立 Apply 草稿；切换工作阶段不会把未应用配置当作已提交计划。操作草稿在节点、阶段或导航模式切换时丢弃，取消不改已提交内容。

计划替换通过 `preparePlannerDocument` 校验并规范化候选文档，重放规范化后的计划，再提交同一份文档。准备失败时保留已提交文档、重放结果、诊断及编辑草稿。

保留操作编辑 ID 和速度编辑时的 Actor ID；角色替换产生新 ID，保留旧操作与失效引用，不按索引重新绑定。
锚点分别为 start、participantId + turn、trigger participantId、cycleBoundary ordinal。动态与倒计时身份由操作 ID 派生，不能按数组位置重建。
插入、替换、移动或删除操作时保留事件位置与既有 `skill`，删除最后一条操作后仍保留带战技标注的事件。编辑模型通过 `setSkill` 显式修改所选的合资格行动，重放使用保存的标注。

目标预览使用 `previewOperationState` 在选中锚点、阶段及操作位置恢复执行上下文，资格与引擎共用；不可用上下文不能用最终参与者目录代替。
不可达事件保留原锚点，允许查看、删除与配置修复，不虚构目标。

## 跨节点批量预设

配置格式、限制、复制示例与校验命令见[预设维护指南](../action-planner-presets.md)。装备预设继续预填单条普通操作草稿，角色批量预设通过统一参数界面应用；列表由定义目录自动发现，游戏数据 Catalog 只提供资源适配。解释器不按角色 ID 分支，不向引擎传递预设专属字段。

知更鸟·晴歌 Fever 预设使用角色 ID `1512` 和 `selfPresence: present`，依次生成自身 depart、我方 memosprite Actor「晴空乐手」、我方 custom Actor「气氛值减半节点」。通用 `self-stat.panelSpeed` 表达式从方案初始角色配置读取战斗外面板速度，由编译器在身份及插入预览检查后注入；乐手基础和面板速度均为该值 × 1.8，节点两项速度均为 140。两者初始 AG 为 10000、行动次数无限。计算结果仅在应用时物化为普通操作数值。表达式、预设身份和速度联动仅用于预设编译。节点自然行动不自动计算气氛值或结束 Fever。

[presets](../../src/tools/action-planner/presets/) 中的人工 JSON 支持八种原子操作，包括无目标的战技点操作，还可声明共享参数、目标快照和 onTrigger 事件。通用解释器解析参数与身份、按声明顺序生成普通 EffectOperation / PlanEvent，并生成候选 PlannerDocument；useActionPlanner 通过统一文件校验和 simulatePlan 重放后一次提交。生成操作出现目标失败警告或候选存在错误时不发布文档、结果或部分存档；预算导致的不可达 Anchor 警告允许保留。ID 由现有分配器预留，失败后不复用已经分配的身份。

卡厄斯兰那预设在所选阶段末尾追加八个 spawnParticipant 与一个显式 depart，另以最后事件的稳定 trigger Anchor 保存 returnToField。离场及回场目标是开始时实际在场的全部我方 Actor ID；没有合法目标时拒绝创建。既有操作与自定义名称保留。
参数为用户输入的基础速度 B 和继承百分比 r，八个事件设置 `baseSpeed = B`、`speed = B × r / 100`、`initialAG = i × 10000 / 7`（i = 0…7），不舍入。默认基础速度读取白厄快照，继承比例默认 60%；不识别星魂或击杀，不限制比例到 84%。
事件名称在创建时从 Site Messages 取得并保存为普通可编辑名称。提交后十条操作各自独立，没有预设组状态、隐藏效果或删除联动；编辑事件保留其 ID、独立 baseSpeed 和 initialAG。一星魂加速由用户多选剩余事件，添加普通无限持续百分比 Modifier。

知更鸟终结技预设通过 metadata.characterIds 的角色 ID `1309` 识别我方 Actor，并在所选锚点、阶段及插入位置的真实预览中检查存在与在场状态；不依赖显示名称、固定槽位或最终参与者目录。身份缺失、歧义、已离场、已移除或上下文不可用时拒绝应用。

预设在所选阶段末尾依次追加显式知更鸟 depart、动态 allies immediatelyAct、创建「协奏」Scheduled Event（speed = 90、initialAG = 10000）。知更鸟已先离场，因此不参与群体立即行动；其他已离场队友也不参与。没有其他在场我方 Actor 时省略群体操作。协奏的稳定 trigger Anchor 下依次追加知更鸟 returnToField、immediatelyAct；回场本身保留 AG，立即行动独立清零。倒计时独立于知更鸟 SPD，首次触发间隔默认 10000 / 90 AV，可继续通过普通操作提前、延后或变速，不保存绝对触发时间。

其他在场队友的 preAction 中，群体立即行动会命中 active-target，因此预设明确拒绝并提示改用 postAction；当前行动者已离场时按真实目标集合判断。知更鸟自身的 preAction / postAction 沿用当前自然回合完整结算及 AG 重置规则，不模拟中断回合。知更鸟与卡厄斯兰那共用内部批量校验与提交函数；生成操作目标失败或完整候选重放错误时均不部分发布。既有 Anchor 操作按原序保留，新操作随后追加。提交后的四或五条操作均可独立编辑、删除；删除协奏创建操作保留孤立回场 Anchor 并诊断，不级联清理。预算外 Anchor 按统一的方案文件规则保存。

流萤终结技预设通过 metadata.characterIds 的角色 ID `1310` 识别我方 Actor，并复用所选锚点、阶段末尾的真实 previewOperationState 上下文。身份缺失、歧义、已离场、已移除或上下文不可用时拒绝应用。流萤自身 preAction 中的行动提前会命中 active-target，因此拒绝并提示改用 postAction；提交时再次检查资格并走同一批量候选校验流程。

预设依次追加单目标 addSpeedModifier（mode = flat、amount = 用户输入、duration = countdown）和 advance 100%。固定速度增量默认 60，接受有限非负数，包括 0。倒计时名称在应用时读取当前语言消息「完全燃烧」或「Complete Combustion」，初始速度固定为 70 SPD，初始 AG 使用引擎默认值 10000。速度操作自动创建倒计时，通过其稳定操作 ID 关联效果到期；不额外保存 spawnParticipant 或移除操作。倒计时触发时仅移除关联 Modifier。advance 100% 将剩余 AG 减少 10000 并以 0 为下限，剩余 AG 超过 10000 时仍需等待，不使用 immediatelyAct。生成后的两条普通操作各自独立编辑、删除。

[当前队列投影](../../src/tools/action-planner/model/current-queue.ts)在开始位置读取开始操作结算后的初始 Snapshot，其余位置读取 NodeRecord.beforeEffects；引擎 snapshots 保留原本的结算后语义。
queueCursor 与 Inspector 选择独立，模式切换保留推进锚点；重放后锚点不可达则游标回开始，Inspector 保留原选择用于修复。
Trace、Tag、目标头像与数值展示约定见 UI 设计规范，不改变执行状态或持久化文档。

## 方案格式与持久化

[document-file.ts](../../src/tools/action-planner/model/document-file.ts)是 JSON 导入 / 导出、存档和模板的统一严格边界：

```text
format: "hsr-game-tools/action-planner"
version: 13
document: { name, plan, metadata }
```

这是字段概览，实际方案使用工具完整导出的 JSON。未知字段、无效结构、重复或不安全身份不会通过放宽校验来兼容。
上限为 2 MiB、1000 个事件、4000 个操作。v1–v9 的原文最多可含 2000 个操作。字符串、目标和嵌套边界由 FILE_LIMITS 定义。
写入统一使用 Version 13。所有版本均要求 `plan` 包含 `actors`、`events`、`maxNodes`、`maxAV`，`metadata` 包含 `customNames` 和 `characterIds`。读取按源版本验证。v4–v9 的旧战技点字段仅用于迁移，v10 可无损读取。v11–v12 中停用的角色效果须确认迁移。

| 版本 | 字段与操作                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 原始文件外壳。`document` 必须包含 `name`、`plan` 和 `metadata`。                                                                           |
| 2    | `plan.cycleMode` 必填，事件可以使用 `cycleBoundary` 锚点。                                                                                 |
| 3    | `plan.aha` 必填，保存 `id`、`baseSpeed` 和 `contributorIds`。                                                                              |
| 4    | `plan.skillPoints` 可选，包含可选的 `enabled`、`initial`、`max`。行动事件可选 `skill`。                                                    |
| 5    | 支持 `restoreSkillPoints`，恢复操作需要 `amount` 和 `source`。                                                                             |
| 6    | `skillPoints.onInsufficient` 可选。                                                                                                        |
| 7    | `skillPoints.storedMax` 和 `restoreSkillPoints.storeOverflow` 可选。                                                                       |
| 8    | `skillPoints.maxModifiers` 可选。每个修正需要 `amount`，可选 `sourceParticipantId`。                                                       |
| 9    | 支持 `conditionalRestore`，需要 `amount`、`source`、`sourceParticipantId`、`chance`、`cooldownTurns`、`outcome`，阶段必须是 `postAction`。 |
| 10   | 使用带符号整数的 `changeSkillPoints`。`skillPoints` 仅接受 `enabled`、`initial`、`max`。                                                   |
| 11   | 初始 Archer 可配置 `initialArcherCharge`。新增 `characterEffect`，需要 `effectId` 和 `sourceParticipantId`。                               |
| 12   | 初始饮月可配置 `imbibitorLunaeTechnique`。新增饮月的 Effect ID，强化普攻需要 `cost`。                                                      |
| 13   | 停用布洛妮娅 E1 和火花爆点的专属操作。新增 `sparkle.ultimate`。                                                                            |

版本门槛源自 `8821cf8`、`237dce5`、`c55c6bc` 和历史战技点读写器 `e1217f1`、`24271fc`、`f7d2bc5`。其中可确认的战技点写入版本为 7 和 9。其余中间版本的字段门槛由历史读取器确认。

Version 1 补 `cycleMode: none`。Version 1/2 补冲突安全的 Aha ID，并按当前目录识别贡献者。Version 3 起保留已保存的 Aha 身份。迁移保留排轴、既有通用操作 ID、锚点和孤立引用。

v4–v9 的技能消耗放在原有 `preAction` 恢复之后，技能恢复放在原有 `postAction` 恢复之前。旧显式恢复保留 ID、阶段和恢复量，优先保留已有自定义名称，否则沿用旧来源名。旧初始有效上限成为固定上限。有动态上限、存储、条件恢复、显式不足策略或未参与结算的技能标注时，转换确认列出受影响的类别和数量，并提供原档下载。本地有损旧档进入存档保护，使用当前原文令牌确认后才写入并发布当前版本。其他已启用战技点的 v4–v9 旧档会提示结算语义已改变。

v11–v12 的布洛妮娅 E1 与火花爆点专属操作须确认后才能移除。迁移报告分别统计两类操作，并保留原档下载。确认后的方案保留普通战技点操作、角色身份和其他配置，只清理被移除操作对应的自定义名称及因此变空的事件。需要表示布洛妮娅回点时，可手动添加 `changeSkillPoints(+1)`。

[历史迁移测试数据](../../tests/fixtures/action-planner/historical-documents.json)记录了各输入的来源提交与历史引擎重放结果。Version 1、2、3、7、9 使用历史写入器导出的测试方案。Version 4、5、6、8 使用历史读取器验证的合成方案。回归测试比较行动顺序与 AV、最终队列及通用诊断，并另行验证战技点转换和存档保护。

旧事件省略 `baseSpeed` 时以 `speed` 为基数。参与者离场状态和运行时速度修正由重放恢复。新增 Aha 可能改变排序和预算内可达节点，界面会提示升级。
导入中的未知 Character ID 保留，非法图片路径移除并报告；图片仅允许资源目录已登记的相对路径。初始敌人以 baseSpeed 统一两项 SPD，保留其他合法字段。

[usePlannerSession](../../src/tools/action-planner/composables/usePlannerSession.ts)先恢复存档，再注册浅提交 watcher；[持久化模块](../../src/tools/action-planner/model/persistence.ts)使用 localStorage 键 `hsr-game-tools/action-planner/current`。
启动迁移不立即回写；导出和页面 teardown 不补写存档。只有提交后的完整文档参与自动保存。

坏存档 / 未支持版本保留原字节并保护写入；外部修改或清空暂停保存，不自动替换内存文档。每次写入比较已知存储基线；明确覆盖需要用户选择与当前 token，并在写入前再次比较。
读取或写入失败时仍可编辑、导出和恢复；只有成功写入才显示已保存。没有跨标签页合并或实时协作。

## 方案与模板维护

普通导入、模板和存档均使用上述解析边界，先校验并准备推演，再确认完整替换；失败或取消不替换当前文档。
非空方案或未提交输入被替换前确认；新建空方案也会更新当前存档，受保护存档仍需明确覆盖。

[usePlannerFiles](../../src/tools/action-planner/composables/usePlannerFiles.ts)统一处理文件导入、模板替换、导出与存档恢复。导出与存档写入均序列化当前提交的完整文档，存档原文备份则保留捕获的字节。战技点配置和仅含战技点操作的事件也属于替换前需要确认的方案内容。

文件导入、启动存档与存档重载均要求原文和规范化后的格式化导出不超过 2 MiB。若存档无法按此契约导出，则保留原字节并阻止自动覆盖。

**正式配队模板必须由用户审阅，不得根据截图或角色技能描述自动生成。**当前[正式目录](../../src/tools/action-planner/templates/catalog.ts)为空；测试方案不进入生产目录。

1. 在工具中配置完整方案，导出 Version 13 JSON 并人工审阅。
2. 将文件放入 [templates/plans/](../../src/tools/action-planner/templates/plans/)。旧模板由统一解析器迁移，保留工具导出的字段。
3. 在 catalog.ts 显式导入 JSON，登记唯一 id、order、nameKey、descriptionKey、file，以及可选 conditionKey / gameVersion。
4. 在两份 Site Messages 添加同路径的名称、简介和可选条件介绍；头像读取方案角色映射，不另外构造队伍身份。
5. 按[开发指南](../development.md#验证策略)运行模板与 i18n 校验，以及方案文件相关测试。

加载获得独立、可编辑的当前文档，不与源 JSON 持续同步；目录或模板更新不自动覆盖用户正在编辑的方案。

## 当前功能边界

### 战技点编辑与推演

可选的 `plan.skillPoints` 默认关闭。启用跟踪后，编队配置显示初始战技点和固定上限，默认分别为 3 和 5，由用户手动设置。当前编队包含 Archer 或丹恒·饮月时，界面显示对应的角色初始状态。关闭跟踪会隐藏这些字段并保留草稿值。运行状态保存余额和上限，余额用 BigInt 精确累计。方案只序列化配置与操作，余额、结果、Trace、队列、草稿与迁移提示均由重放或界面生成。

`changeSkillPoints.amount` 是有符号安全整数。正数逐笔恢复至上限，溢出丢弃。负数直接消耗并可进入负余额，零及未配置节点保持余额。关闭跟踪时，已配置的战技点操作仍保存在方案中。

每个执行阶段先按卡片顺序结算 `changeSkillPoints` 和 `characterEffect`，随后按原顺序结算普通操作。自然行动使用 `preAction` 和 `postAction`，战斗开始、触发和轮次边界使用无阶段列表。预览和正式执行使用同一优先顺序。Inspector 从节点进入状态和结算快照读取汇总余额，单条操作展示实际结算。每个产生负余额消耗的节点至多记录一条警告，整次推演的第一条警告样式更醒目。

角色专属操作通过 `sourceParticipantId` 和 `metadata.characterIds` 绑定初始我方角色。引擎按参与者 ID 管理专属资源。关闭战技点跟踪会暂停角色效果的结算，已插入的普通行动提前仍按原调度规则执行。已失效的来源引用保留原 ID，便于重放诊断和历史修复。

- Archer（`1015`）的初始充能在 Battle Setup 配置，取 0–4 的整数，默认 0。`archer.ultimateCharge` 加 2 层，最多 4 层。`archer.followUp` 消耗 1 层并恢复最多 1 点战技点。用户指定追击发生的位置。无充能时记录警告，后续操作照常结算。
- 丹恒·饮月（`1213`）的逆鳞默认 0，战斗配置勾选秘技后从 1 开始。普通终结技加 2，E2 终结技加 3，最多持有 3。E2 预设另加入普通 `advance(100)`。自身行动上的强化普攻按所选档位支付 1、2 或 3 点。[^substitute-skill-config]

专属支付先用对应资源抵扣，再扣普通战技点。运行记录分别保存名义消耗、抵扣量、实际扣点和两种余额的前后值。名义消耗包含视为消耗战技点的逆鳞抵扣部分。只有实际扣除普通战技点且余额为负时才记负余额警告。

花火（`1306`）的强化终结技 `sparkle.ultimate` 恢复 6 点普通战技点，将本次溢出加入独立储存，最多储存 10 点。初始储存为 0。终结技记录普通战技点和储存的实际变化，以及超过储存上限的浪费量。普通回点只影响普通余额。[^sparkle-storage]

引擎在我方角色自然回合的全部 `postAction` 操作之后、行动次数上限移除和快照生成之前执行补给。提前或立即行动产生的角色回合照常结算。召唤物、忆灵、自定义 Actor、敌方、阿哈、倒计时和轮次边界不触发补给。未分类的初始我方 Actor 视为角色，动态 Actor 须明确标为角色。额外回合沿用当前调度的表达边界。

花火暂离时已储存的战技点仍可补给。参与者被移除后停止补给。多个花火实例按初始站位顺序结算。Inspector 从已完成节点读取独立的自动补给记录。配置文件只保存用户添加的操作，储存和补给记录随重放生成。

尚未实现完整技能执行、伤害与能量系统、多波次、角色特殊行为自动推演、额外阿哈时刻、真实敌人数据目录、云同步、账号或多方案库。
装备预设只创建可编辑的普通操作，不自动判断装备条件。[抽卡模拟器](warp-simulator.md)与[货币战争优化器](../currency-wars.md)已作为独立工具实现，不与排轴引擎共享业务状态；遗器模拟器仍在施工中。
这些边界描述当前工具实现；机制不确定处保留上述近似和限制，不将静态验证等同于完整游戏验收。

### 参考文献

[^substitute-skill-config]: HoYoverse. 饮月的正式版技能费用和参数. TurnBasedGameData 4.6 快照 `74a7b96`. [AvatarSkillConfig.json](https://github.com/Oereor/TurnBasedGameData/blob/74a7b96fba32f00cf495a5c00b0311bd02207aaf/ExcelOutput/AvatarSkillConfig.json)

[^sparkle-storage]: HoYoverse. 花火强化终结技的储存标记和回合结束回点配置. TurnBasedGameData 4.6 快照 `74a7b96`. [Avatar_Advanced_Sparkle_00_Ability.json](https://github.com/Oereor/TurnBasedGameData/blob/74a7b96fba32f00cf495a5c00b0311bd02207aaf/Config/ConfigAbility/Avatar/Advanced/Avatar_Advanced_Sparkle_00_Ability.json#L2946)
