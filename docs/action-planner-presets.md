# 行动序列预设维护

预设是人工维护的声明式配置。运行时解释器将其转换为操作和事件，再经完整校验与模拟一次提交。Version 13 方案文件保存编译后的计划数据。预设身份、参数引用、目标快照和嵌套声明仅用于编译。引擎语义和文件格式见[模拟器架构](architecture/action-order-simulator.md)。

## 新增预设

1. 在 `src/tools/action-planner/presets/definitions/` 新建一个 JSON，填写唯一 `id` 和排序 `order`。文件通过目录自动发现，无需注册 TypeScript 导入。
2. 在 `src/locales/zh-CN.json`、`src/locales/en.json` 添加名称、描述及参数文本。所有引用必须在两种语言中存在，插值参数必须完整匹配。
3. 填写 `icon.characterId` 使用现有角色头像，或填写 `icon.assetKey` 使用已登记资源。省略图标时使用现有占位。新资源通过[游戏数据维护流程](game-data.md)登记，不填写任意图片地址。
4. 运行 `npm run validate:planner-presets`，再运行相关测试。VS Code 通过 `$schema` 提供补全和字段提示。

以下示例可复制到 definitions。添加对应的双语 `planner.example` 文本后即可校验；`name`、`description`、`speed`、`hint` 均为字符串消息，`event` 消息包含 `{index}`。

```json
{
  "$schema": "../preset.schema.json",
  "id": "example-countdown",
  "order": 10,
  "interaction": "batch",
  "i18n": {
    "name": "planner.example.name",
    "description": "planner.example.description"
  },
  "icon": { "characterId": "1408" },
  "snapshots": {
    "team": { "target": "allies", "operation": "depart" }
  },
  "operations": [
    {
      "type": "depart",
      "target": { "snapshot": "team" }
    },
    {
      "type": "spawnParticipant",
      "participant": {
        "kind": "scheduledEvent",
        "name": {
          "type": "i18n",
          "key": "planner.example.event",
          "params": { "index": 1 }
        },
        "speed": {
          "type": "user-input",
          "id": "speed",
          "value": 90,
          "exclusiveMinimum": 0,
          "i18n": {
            "label": "planner.example.speed",
            "hint": "planner.example.hint"
          }
        }
      },
      "onTrigger": [{ "type": "returnToField", "target": { "snapshot": "team" } }]
    }
  ]
}
```

`interaction: "batch"` 应用完整预设：有输入时展示统一参数表单，无输入时直接应用。`interaction: "draft"` 只允许一条操作且不带触发事件，选中后预填普通草稿，用户仍可修改目标、参数并确认。`startOnly: true` 将入口限制在战斗开始。

## 操作声明

每条操作使用下表字段，不填写运行时 `id` 或 `phase`。顶层操作继承当前阶段，触发事件中的操作不携带阶段。引擎按执行分组保留各组内的声明顺序。

| type               | 必填字段                               | 说明                                                           |
| ------------------ | -------------------------------------- | -------------------------------------------------------------- |
| `advance`          | `target`, `percent`                    | 减少 `10000 × percent / 100` AG，最低为零；percent 有限且非负  |
| `delay`            | `target`, `percent`                    | 增加相同比例的 AG；percent 有限且非负                          |
| `immediatelyAct`   | `target`                               | 将 AG 归零并形成新的零 AV 插入批次，与 advance 100% 不同       |
| `addSpeedModifier` | `target`, `mode`, `amount`, `duration` | mode 为 flat / percent；amount 为有限数，允许减速              |
| `spawnParticipant` | `participant`                          | 创建 Actor 或 Scheduled Event                                  |
| `depart`           | `target`                               | 离场冻结 AG                                                    |
| `returnToField`    | `target`                               | 仅恢复离场目标的调度，保留 AG                                  |
| `characterEffect`  | `effectId`, `target`                   | 限批量预设顶层操作，目标为 `self`，角色身份须与 Effect ID 匹配 |

速度持续时间使用 `{"kind":"turns","turns":2}`、`{"kind":"turns","turns":null}` 或 `{"kind":"countdown","name":"计时器","speed":70}`。turns 必须为正整数，null 表示无限。涉及定时事件目标的速度效果只支持无限持续，继续由引擎检查。

Actor 的最小结构是 `{"kind":"actor","name":"单位","camp":"ally","baseSpeed":100,"panelSpeed":120}`。可选 category、actionLimit、initialAG；actionLimit 为正整数或 null。Scheduled Event 使用 `{"kind":"scheduledEvent","name":"事件","speed":90}`，可选独立 baseSpeed 和 initialAG。initialAG 默认 10000，允许零和非负分数。

批量预设可声明无目标的 `changeSkillPoints`，包括在 `onTrigger` 事件中声明。唯一业务参数 `amount` 是有符号安全整数字面值。编译后的操作可在战技点区编辑，负余额警告随重放保留。结算顺序见[战技点编辑与推演](architecture/action-order-simulator.md#战技点编辑与推演)。

启用战技点跟踪后，可从战技点编辑器使用 Archer 终结技和追击回点预设。编译将 `self` 保存为 `sourceParticipantId`。充能不足的追击仍可记录为操作，引擎在结算时给出警告。

丹恒·饮月的普通终结技与 E2 终结技分开提供。E2 批量追加专属资源操作和目标为 `self` 的 `advance(100)`。自身行动前若无法拉条，预设拒绝整批并提示切换到行动后。强化普攻通过 `cost` 选择 1、2 或 3 点。

花火终结技预设生成一条 `sparkle.ultimate`，由引擎执行普通战技点恢复和溢出储存。后续回合结束的自动补给由推演生成，只读记录显示在 Inspector 中。

## 目标与事件

- `self`：顶层 `characterId` 对应的唯一初始我方 Actor。缺失、歧义或已移除时拒绝应用；通过身份元数据识别，名称和槽位不影响结果。可选 `selfPresence` 为 present / departed / any，默认 any；流萤、知更鸟配置 present 保留必须在场的限制，回场类预设则可选择 departed。
- `allies` / `enemies`：保留引擎群体目标，按各条操作实际执行时的资格选取对应阵营 Actor。
- `selected`：调用时提供的单选或多选参与者 ID，JSON 本身不填写运行时 ID。批量预设的统一表单提供目标网格；选择结果在插入时固定，触发操作沿用这些 ID，并在实际执行时检查资格。
- `{"snapshot":"team"}`：使用顶层 snapshots 声明的目标集合。集合在插入位置的真实预览中采集一次；后续回场不重新选择新加入的我方单位。空快照拒绝应用。

群体操作可添加 `onEmpty: "skip"`。顶层空群体操作直接省略；可达触发事件通过候选重放判断空群体。预算外事件保留普通群体操作，不猜测未来目标；扩大预算后仍按引擎普通操作处理。非法目标、active-target 和非群体空目标不会因 skip 被忽略。

Scheduled Event 的 spawnParticipant 可携带 `onTrigger`，countdown 类型的 addSpeedModifier 也可携带。解释器使用操作身份派生触发锚点，JSON 不计算事件 ID。普通 Actor 和 turns 持续效果禁止使用 onTrigger。到期 Modifier 先移除，然后执行触发操作，沿用引擎既有顺序。

最多四层触发事件嵌套、128 条操作（包含触发操作）、64 个输入参数，单个参数值最多嵌套 16 层。超限会明确报错，不截断。预算外事件允许保留；删除已生成的创建操作后，关联锚点继续作为孤立配置保留供修复。

## 输入、共享参数与计算

`user-input.value` 为数字、字符串或角色基础速度查询。数字生成 InputNumber，字符串生成 InputText；用户没有修改时使用默认值。`i18n` 可包含 label、hint、placeholder、suffix，全部填写翻译 key。minimum 为包含下界，exclusiveMinimum 为不包含下界；具体操作合法性仍由 TypeScript 和引擎检查。

参数在整份 JSON 中自动收集。多个相同声明只生成一个输入框；同 ID 的不一致声明报错。后续位置推荐使用 `{"type":"ref","id":"speed"}` 引用，允许引用出现在声明之前。

数值型 `user-input` 可声明 `options` 列表。每项包含唯一的数值 `value` 和双语消息键 `labelKey`，默认值和用户提交值均须属于选项。表单使用 Select。

基础速度默认值可写为：

```json
{
  "type": "user-input",
  "id": "baseSpeed",
  "value": { "type": "character-stat", "characterId": "1408", "stat": "baseSpeed" },
  "exclusiveMinimum": 0,
  "i18n": { "label": "planner.khaslana.baseSpeed" }
}
```

仅支持乘法和除法节点。以下结构精确表达 `baseSpeed × (inheritancePercent / 100)`；两个参数各声明一次即可共享：

```json
{
  "type": "multiply",
  "left": { "type": "ref", "id": "baseSpeed" },
  "right": {
    "type": "divide",
    "left": { "type": "ref", "id": "inheritancePercent" },
    "right": 100
  }
}
```

运算保持声明的括号顺序和浮点精度，除零及非有限值报错。`i18n` 支持 `params`，在应用时解析为当前语言字符串；生成的事件名称之后作为普通名称保存。顶层 previews 可配置 `[{"key":"planner.khaslana.initialSpeed","params":{"speed":90}}]`，数值也可替换为上述计算节点，统一表单展示只读结果。

### 读取自身战斗外面板速度

数值表达式 `{"type":"self-stat","stat":"panelSpeed"}` 读取顶层 `characterId` 对应的唯一初始我方 Actor 在当前方案中的 `panelSpeed`，不读取图鉴基础速度或战斗中 Modifier 修正后的速度。可嵌入乘除表达式；不作为 `user-input.value` 默认值。解释器需要调用方提供自身属性上下文，缺失或非有限正数时报错，不提供回退值。静态校验只使用代表性正数检查表达式结构与操作，应用时才检查实际角色及属性。

「知更鸟·晴歌 Fever 状态」预设依次使自身离场，创建我方忆灵「晴空乐手」，再创建我方自定义单位「气氛值减半节点」。乐手的 baseSpeed 与 panelSpeed 都为自身战斗外面板速度 × 1.8；节点两项速度均为 140。两者 initialAG 为 10000，行动次数无限。应用时将计算结果保存为普通数值，之后修改知更鸟·晴歌面板速度不会联动更新既有创建操作。预设不模拟气氛值、自动结束 Fever、自动回场或星魂效果。

## 校验与人工验收

`npm run validate:planner-presets` 扫描全部定义，使用独立 Draft-07 Schema 和静态语义校验检查结构、ID、引用、默认值、翻译及插值、图标和数量限制。CI 的 Validation Job 执行同一命令。游戏数据 Catalog 中遗留的 presets 仅提供既有装备资源，不决定运行时预设列表；人工配置不由更新器覆盖。

修改后运行相关 Vitest 测试、type-check、validate:i18n、lint 和 build。编译生成候选方案，严格校验及模拟成功后一次提交；目标失败或模拟错误不会发布部分文档。静态配置校验不代替当前队伍的动态目标检查。

界面由维护者在中英文、桌面和 390px 窄屏下人工验收：列表图标与说明；装备预填充后修改、取消和应用；参数默认值、清空、负值和共享值；阶段切换时的禁用原因；流萤自身 preAction、知更鸟队友 preAction、仅知更鸟在场；失败后原文档不变；应用后普通操作编辑、导出和刷新恢复。

Fever 预设人工验收（中英文均需检查）：加入知更鸟·晴歌并设置面板速度 160，添加战斗加速后应用预设，确认三条操作、288 速忆灵和可重复行动的 140 速节点；角色缺失或已离场时检查禁用说明；编辑生成单位后导出并刷新，确认名称、速度及行动次数保留。桌面与 390px 窄屏检查说明和操作名称可读。
