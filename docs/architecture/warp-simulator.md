# 跃迁模拟器引擎

本指南是 Phase 1D 实际实现的现行契约。模型由维护者确定，标识为 `hsr-warp`，版本为 `v0.3`；它是**本项目的标准模型，不代表已经取得或验证游戏服务器源码**。历史调查不能覆盖本指南中的既定规则。

数据维护见[游戏数据指南](../game-data.md#warp-数据基础设施)，实施证据见[Phase 1D 报告](../investigations/warp-simulator/phase-1d-engine-implementation.md)。本阶段只有纯引擎，没有跃迁页面、用户存档、动画或统计面板。

## 模块与输入边界

[engine](../../src/tools/warp-simulator/engine/) 下的 `probability.ts`、`resolver.ts`、`state.ts`、`gacha.ts`、`types.ts` 分别负责概率、卡池解析、会话状态、抽样及类型；`validation.ts` 统一输入诊断。引擎只依赖自身模块及 [Warp 数据契约](../../src/tools/warp-simulator/data/schema.ts)的类型，不导入 JSON、Vue、DOM、翻译、文件系统、维护脚本或其他工具业务。

运行上下文来自规范化 `WarpSnapshot`。Item Catalog 的存在不代表抽取资格；解析只使用 Banner 引用的共享名单及显式 UP。维护文件、运行时快照和名单不会被引擎修改。

| 接口                                        | 返回及行为                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `resolvePool(snapshot, bannerId, options?)` | `WarpResult<ResolvedPool>`；Banner 使用 `gacha:<GachaID>`，角色池须传 `options.selectedAvatarIds` |
| `createSessionState()`                      | 五组计数为零、保证为 false 的独立只读会话，包含模型身份                                           |
| `pullOnce(pool, state, rng)`                | `WarpResult<{ event, nextState }>`                                                                |
| `pullTen(pool, state, rng)`                 | `WarpResult<{ events, nextState }>`；恰好连续执行十次相同单抽逻辑                                 |

`WarpResult<T>` 为 `{ ok: true, value: T }` 或 `{ ok: false, diagnostic: { code, path, params } }`。诊断不包含本地化文案；`path` 是输入上下文路径，不是维护 JSONC 的行列位置。错误码为 `invalid-snapshot`、`unknown-banner`、`unknown-pool`、`unknown-item`、`invalid-pool`、`invalid-selection`、`invalid-state`、`invalid-rng`、`rng-threw`。预期输入错误转为失败结果；内部程序错误继续抛出，不伪装成输入错误。

`ResolvedPool` 保存 Banner、GachaID、共享池 ID、kind、pityGroup、模型身份、三星／四星候选、五星抽样槽位及 UP。物品仅含 `id`、`kind`、`rarity`，名称不参与判断。Resolver 复制物品并冻结池、候选数组和成员；调用方后续修改 Snapshot 或选择数组不会影响已解析池。抽取入口也会校验结构化构造的 ResolvedPool，不允许通过省略候选绕过校验。

解析验证唯一身份、合法引用、类型与星级、非空候选、候选去重、UP 数量、组匹配和模型适用条件。Ordinary 的五星共享池须为 mixed 且同时包含两种物品类型。未配置的 Banner 或不足的名单返回诊断，不自动推断或补齐。一个其他 Banner 尚待配置不会阻止现有有效 Banner 的解析。

## 概率模型 v0.3

`n` 是从上次对应稀有度命中后计算的当前抽数，第一抽为 1。概率函数只接受正安全整数，否则抛出 `RangeError`。

| 类型                            | 五星条件概率 p5(n)                                  | 四星条件概率 p4(n)                                  |
| ------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| 角色 Event、Fate 角色、Ordinary | n ≤ 73：0.006；否则 min(1, 0.006 + 0.06 × (n − 73)) | n ≤ 8：0.051；n = 9：0.52；n ≥ 10：1                |
| 光锥 Event、Fate 光锥           | n ≤ 65：0.008；否则 min(1, 0.008 + 0.07 × (n − 65)) | n ≤ 7：0.066；n = 8：0.397；n = 9：0.728；n ≥ 10：1 |

五星 Hard Pity 分别为第 90／80 抽，四星均为第 10 抽。每抽先用独立一次 RNG 判断五星；未命中才用下一次 RNG 判断四星，否则三星。比较条件严格为 `<`，随机数等于概率阈值时未命中。

```text
P(5★) = p5
P(4★) = (1 − p5) × p4
P(3★) = (1 − p5) × (1 − p4)
```

`rarityProbabilities(kind, n5, n4)` 返回上述无条件分布。四星曲线不是无条件概率，不为拟合官方显示值修改公式或顺序。

## 候选与 UP

角色 Event 和 Fate 角色要求显式选择七名不同的合法五星角色。合法集合是 `sharedPool.fiveStar`，不自动使用它的前七项或完整集合。非保证五星：50% 直接获得当前 UP，50% 从 `[UP, ...七名选择]` 八个槽位等权抽取。选择允许包含 UP，前提是 UP 也在该共享资格集合中；此时保留两个相同 ID 槽位。

光锥 Event 和 Fate 光锥的非保证五星：75% 直接获得 UP，25% 从 `[UP, ...七张固定光锥]` 八槽位等权抽取。固定光锥由人工共享名单提供，必须恰好七张且不同于 UP，不接受角色选择参数。引擎验证名单结构，不自行认证或更换其历史常驻资格。

| 五星非保证情形      |              最终 UP 概率 |
| ------------------- | ------------------------: |
| 角色七名选择不含 UP |    50% + 50% / 8 = 56.25% |
| 角色七名选择含 UP   | 50% + 50% × 2 / 8 = 62.5% |
| 光锥                |   75% + 25% / 8 = 78.125% |

普通角色 Event 和光锥 Event 分别有三个同类型、不同 ID 的四星 UP。非保证四星以 50%／75% 进入 UP 分支，在三项中等权抽取；其余概率从完整四星共享候选中按物品等权抽取，不先选择物品类型，不添加或排除 UP。因此最终任意四星 UP 概率为 `a + (1 − a) × k / m`，其中 a 为直接分支概率，m 为回退候选数，k 为其中 UP 数。

实际获得对应稀有度 UP 时清除该保证，无论来自直接或回退分支；实际获得非 UP 时激活保证。保证状态下，下一次实际五星必为当前 UP，下一次实际四星从三个 UP 等权抽取。身份比较始终使用 canonical ID，不能使用对象引用、名称或抽样分支。

Ordinary 没有 UP，五星及四星分别从完整对应候选统一等权抽取。Fate 的五星遵循对应 Event 机制，四星统一抽取且没有 UP。UP 与共享候选是独立输入，普通 Event 不要求四星 UP 必须出现在回退集合中，也不会自动将其合并进去。

## 保底状态、继承与原子性

Session 以以下五个固定键存储状态，键必须与 Banner kind 一致，不接受 GachaID 或 UI GroupID 替代：

- `pity:event-avatar`
- `pity:event-light-cone`
- `pity:fate-avatar`
- `pity:fate-light-cone`
- `pity:ordinary`

每组包含 `pullsSinceLast5`、`pullsSinceLast4`、`guaranteed5`、`guaranteed4`。五星未命中计数范围为角色／Ordinary 0…89、光锥 0…79。四星未命中计数范围为 0…9，9 是“待兑现第十抽四星保证”的饱和值，不表示可以跳过保证。

| 结果 | 五星计数 | 四星计数         | 保证变化           |
| ---- | -------- | ---------------- | ------------------ |
| 五星 | 归零     | min(9, 原值 + 1) | 仅更新五星 UP 保证 |
| 四星 | 加一     | 归零             | 仅更新四星 UP 保证 |
| 三星 | 加一     | min(9, 原值 + 1) | 均不改变           |

五星优先于四星 Hard Pity；一次或连续多次五星都不会清除尚未兑现的四星保证。同组切换 Banner 或星缘选择保持计数和保证，兑现时使用新 Banner 的 UP。所有组互相独立。Ordinary 的两种保证、Fate 的四星保证必须为 false；非法标志不会被静默修正。

抽取开始前校验完整 Session，包括未选中的组，以及所有必需候选；失败不消费 RNG。之后每个 RNG 返回值必须为有限数字且在 `[0,1)` 内，否则返回失败。RNG 抛错使用 `rng-threw`，非法返回值使用 `invalid-rng`。单抽和十连只返回完整成功状态，十连后段失败时不暴露成功前缀；输入状态始终不改写。外部 RNG 的进度不回滚。

返回状态复制并冻结五组数据，事件的 `pityBefore` 也独立复制，避免与调用方可变输入共享引用。事件保留模型、Banner、继承组、物品 ID、稀有度、抽前状态、`branch` 和 `isUp`。`branch` 为 `uniform`／`guaranteed`／`direct`／`fallback`，`isUp` 在该稀有度没有 UP 时为 null；二者不能互相代替。

RNG 只由调用方注入：`{ next(): number }`。固定种子不是生产存档契约。消费顺序如下：

1. 每抽判断五星，只有未命中才判断四星，包括概率为 1 的判断。
2. 无 UP 时抽一次候选；有保证时跳过分支 RNG。
3. 非保证时抽一次分支；确定的五星 UP 不再抽物品索引，四星 UP 分支仍抽一次索引。
4. 回退分支抽一次槽位索引；等权索引为 `floor(rng × 候选数)`。

## 调用与验证

```ts
const resolved = resolvePool(snapshot, 'gacha:2139', {
  selectedAvatarIds: reviewedPlayerSelection,
})
if (resolved.ok) {
  const result = pullTen(resolved.value, currentSession, { next: () => Math.random() })
  if (result.ok) {
    // 由调用方一次发布结果；失败时保留 currentSession。
    currentSession = result.value.nextState
  }
}
```

当前已维护的真珠 Banner `gacha:2139` 使用 `event-avatar-default`，显式选择现有七名候选后可解析为 25 个三星、53 个四星、8 个五星回退槽位，五星 UP 为 `avatar:1503`。缺少选择时返回 `invalid-selection`。本阶段不替玩家保存选择或修改维护名单，5 个 pending 仍保留。

确定性单元测试使用独立合成数据覆盖全部五类卡池，并只读核对真实 Banner。独立 Oracle 用五星生存函数与联合保底状态稳态交叉计算长期率，分支枚举验证实际抽样和 UP 权重。固定 Seed 实验使用真实单抽转移的十连接口，只保留当前十项，不生成大量展示历史。

```bash
npm test -- tests/unit/warp-simulator
node --import tsx tests/experiments/warp-simulator.ts
```

长期参考率：角色／Ordinary 五星约 1.605205%、四星约 12.955843%；光锥五星约 1.872272%、四星约 14.499985%。这些是项目模型计算值，不是官方概率认证。统计实验不是普通单元测试的一部分，也不是唯一验收标准。

后续 UI 阶段负责页面级状态发布、七名选择交互、语义诊断翻译、结果展示、历史容量和存档版本；本阶段不注册路由、不定义持久化格式、不实现常驻 300 抽自选或新手池。
