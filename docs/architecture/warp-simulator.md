# 跃迁模拟器

本指南描述纯引擎、页面会话、结果展示、全屏演出及 Phase 1L 控制面板与星缘持久化当前实现。模型由维护者确定，标识为 `hsr-warp`，版本为 `v0.3`；它是**本项目的标准模型，不代表已经取得或验证游戏服务器源码**。历史调查不能覆盖本指南中的既定规则。

数据维护见[游戏数据指南](../game-data.md#warp-数据基础设施)，实施证据见 [Phase 1D 报告](../investigations/warp-simulator/phase-1d-engine-implementation.md)、[Phase 1E 报告](../investigations/warp-simulator/phase-1e-ui-implementation.md)和 [Phase 1F 报告](../investigations/warp-simulator/phase-1f-visual-refinement.md)。`/warp-simulator` 提供单抽、十连、星缘选择及页面内历史，没有用户存档、导入导出或统计面板。

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

当前已维护的真珠 Banner `gacha:2139` 使用 `event-avatar-default`，显式选择现有七名候选后可解析为 25 个三星、53 个四星、8 个五星回退槽位，五星 UP 为 `avatar:1503`。缺少选择时返回 `invalid-selection`。引擎不保存玩家选择或修改维护名单，页面仅在内存中保存明确确认的选择，5 个 pending 仍保留。

确定性单元测试使用独立合成数据覆盖全部五类卡池，并只读核对真实 Banner。独立 Oracle 用五星生存函数与联合保底状态稳态交叉计算长期率，分支枚举验证实际抽样和 UP 权重。固定 Seed 实验使用真实单抽转移的十连接口，只保留当前十项，不生成大量展示历史。

```bash
npm test -- tests/unit/warp-simulator
node --import tsx tests/experiments/warp-simulator.ts
```

长期参考率：角色／Ordinary 五星约 1.605205%、四星约 12.955843%；光锥五星约 1.872272%、四星约 14.499985%。这些是项目模型计算值，不是官方概率认证。统计实验不是普通单元测试的一部分，也不是唯一验收标准。

## 页面会话与交互

[WarpSimulatorPage.vue](../../src/tools/warp-simulator/WarpSimulatorPage.vue)为懒加载路由入口，首页工具目录正式开放 Warp 卡片。Warp 专属 components、composables、model 与 data 均位于工具目录内，不运行时依赖排轴内部模块。UI 设计见[设计规范](../design-notes.md#跃迁模拟器)。

`useWarpSimulator({ snapshot?, rng?, storage? })` 创建页面实例拥有的会话，默认使用仓库内规范化 Snapshot 与真实 `Math.random` Adapter；测试可注入合成 Snapshot、RNG 及 storage 获取函数。Manifest 的 pending／incomplete 不作为全局禁用条件。Banner 列表用现有 Resolver 验证完整配置；角色预检临时使用七项合法候选作为可解析性验证样本，该样本不保存为玩家选择、不用于抽取。真正抽取只使用玩家已明确确认的选择。

控制面板按角色 Event、光锥 Event、Ordinary、Fate 角色、Fate 光锥排序，只显示至少有一个有效 Banner 的类别。初始选中首个有效类别的首个 Banner；每类上次选择仅在页面内存中保留。`bannerGroups`、`activeKind`、`kindBanners` 提供分类及当前类别完整卡池列表，`selectKind` 经 `selectBanner` 的原操作锁选择该类上次的合法 Banner 或首项。切换不修改已提交会话或 latestBatchId，因此不清空历史、不重播演出；五个保底组保持独立。

`WarpBannerList` 仅接收有效 Banner 列表、选中 ID、操作锁和既有 Presentation Adapter，发送 `select(id)` 交回 `selectBanner`，不拥有业务状态。卡池列表在 Drawer 中独立滚动；底部保底、星缘及重置不属于 TabPanel，始终绑定当前 Banner 的派生状态。矮屏底部控制区可以内部滚动，不改变保底投影或重置作用域。

角色 Event 和 Fate 角色共用一份已确认的七人选择，不以 Banner ID 为键。角色资格来自当前共享池的 `fiveStar`，不是 Item Catalog 或已解析的八个回退槽位。每个当前角色池均重新通过 `resolvePool`；不兼容时保留名单、提示调整并禁用抽取，不扩充资格或替换成员。搜索头像网格 Dialog 的草稿与已确认名单分离，恰好七名不同且对当前 Banner 合法的角色才可确认；合法的当期 UP 可以包含在七人中。取消不提交；修改只影响未来结果。失效或当前池不接受的已选项另列为可移除项，移除后仍只能从当前合法候选中手动补选。光锥和 Ordinary 不显示星缘入口，也不向 Resolver 传入选择参数。

单个已提交 `shallowRef<WarpPageSession>` 保存引擎状态、历史与最新批次身份。`draw(1 | 10)` 调用现有引擎，成功后一次替换整个会话；失败只设置语义诊断，保留原对象及全部历史。抽取期间设置防重入锁，在当前 Vue 更新完成后解除；切池、选择和重置操作也受锁及 Dialog 状态约束，不把动画当作业务等待条件。

保底以五星、四星两个分组直接展示当前组计数和 UP 保证，未适用的保证为“不适用”。四星饱和值 9 显示“9+ 抽未出四星”并附待兑现说明，不声称它是精确累计抽数。UI 不计算 Soft Pity、UP 命中或保证转移。

历史保存原始只读 PullEvent，并增加页面内递增条目 ID 和批次 ID。最多保留最近 1000 条，每页 25 条，最新优先；新抽取回到第一页。最新批次从同一历史派生并恢复原始抽取顺序，不为了稀有度排序。UP 标记仅使用事件的 `isUp`，来源按事件的 Banner ID 显示，模型及抽前状态仍保留于事件。五星条目的“当次五星保底抽数”为 `pityBefore.pullsSinceLast5 + 1`，不会因后续切池、重置或语言改变而重算。

重置须经 Dialog 确认，取消不提交：

- 当前组重置只替换该继承组的引擎计数与保证，保留其他组、历史、最新批次和所有星缘选择。
- 全部重置清空五组引擎状态、历史及最新批次，保留当前 Banner 和共享星缘选择。
- 页面内条目／批次身份不因重置复用。刷新或离开页面销毁引擎会话和类别记忆；重新进入仅恢复浏览器中的星缘选择，没有全局业务单例。

### 星缘浏览器存储

独立 [affinity-persistence](../../src/tools/warp-simulator/model/affinity-persistence.ts) 是 Warp 中唯一访问 localStorage 的模块，不依赖其他工具的存档实现。键为 `hsr-game-tools:warp-affinity:v1`，JSON 严格只含 `schemaVersion: 1` 和 `selectedAvatarIds` 数组。七个 ID 必须为不同的 canonical 角色 ID；恢复还需整份名单在至少一个有效角色 Banner 下通过现有 Resolver，不能用多个候选集合的并集替代资格检查。之后仍按当前 Banner 解析；其他池有效、当前池不兼容不算全局存储失效。

页面初始化读取一次；不存在存储时从空选择开始。损坏 JSON、错误结构、未知版本、ID 类型／格式错误、数量或重复错误回退为空内存选择并要求重新确认；结构合法但资格过期的名单保留为待调整内容，不能作为合法抽取上下文。原始存储字节不会因恢复失败或切池而被删除、重写。

仅用户成功确认选择后才同步替换内存名单并尝试写入；草稿、取消、抽取、两类重置、语言／类别切换和卸载均不写存储。存储获取／读取／写入异常只产生语义通知，确认后的内存名单仍可正常抽取；写入失败不回滚有效选择。不保存 Banner、引擎会话、历史、RNG 或草稿，不提供跨标签同步。接口 `AffinityStorage` 只需 `getItem`／`setItem`，测试通过 `storage: () => adapter` 或返回 undefined 模拟内存环境。

控制与存储实现、验证及人工步骤见 [Phase 1L 报告](../investigations/warp-simulator/phase-1l-control-panel-and-affinity-persistence.md)；头像列表与固定底部控制区见 [Drawer UI 重构报告](../investigations/warp-simulator/control-drawer-ui-refactor-2026-10-19.md)。

## 全屏结果演出

`useWarpSimulator` 的 draw、原子提交、RNG 消费与保底转移不因演出改变。页面以同步 watcher 监听已提交的 latestBatchId，把同一最新批次的只读 HistoryEntry 交给 `useWarpReveal`；没有在演出阶段补抽或推迟提交。历史和引擎状态在 Overlay 打开之前已经更新。

`useWarpReveal(reducedMotion)` 只保存 UI 状态：待展示批次、过滤后的演出队列、游标、阶段、Dialog 可见性及上一批已展示记录引用。单抽队列包含唯一结果；十连只过滤五星，不改变相对顺序。无队列立即发布普通结果；有队列保留上一批普通结果，在最后一项确认并收到 after-hide 后才发布完整新批次，防止提前闪现或在黑幕下播完卡片入场动画。展示引用不是另一份可编辑业务会话。

阶段为 idle／identity／artwork／waiting／leaving。五星通过 `WarpRevealIdentity` 显示实际物品的命途与五颗 StarBig，`useWarpIdentityReady` 仅汇总六张图片或最终占位的就绪事件，核对 batchId／entryId、去重并拒绝销毁后的回调，不创建队列或计时器。全部就绪后发送一次 identity-ready，由现有状态机开始 1100ms Identity：V3 CSS 完成命途淡入／变淡及外星→内星→中央星的闪亮，约 742.5ms 后保留最终构图至阶段结束。其余单抽直接 artwork。当前图片或最终占位就绪后才开始 400ms 图片淡入，然后 waiting，无自动关闭。前置阶段激活只跳到当前 artwork；artwork 加载／淡入期间激活不推进，waiting 才进入 400ms leaving，再进入下一项或关闭。Escape 可在资源待加载时及任意可见阶段结束当前项，不退出整队列；leaving 的重复输入不产生额外推进。

每次批次／阶段变化清除旧计时器并递增版本标识，也防止同步 ready 回调重入时重复排程。重复／更旧 Batch ID 不重播，替换批次和作用域销毁取消旧状态；旧 Dialog 隐藏回调不能释放仍可见的新批次。资源 ready 事件携带 batchId／entryId，状态机核对当前身份、可见性、离场与销毁状态后才接受；旧图片加载不能推进新项。全部重置清除展示引用，不复用业务批次身份。Reduced Motion 跳过 identity 和淡入，在资源就绪后直接 waiting；运行中启用时取消阶段计时，若正在离场则直接完成当前项离场。媒体查询、DPR／视口监听器和计时器随作用域销毁。

`WarpRevealOverlay` 接收 visible、entry、item、phase 及 identityReady／artworkReady，发送 activate／escape／after-hide 和带身份的 identity-ready／artwork-ready，不创建会话或队列。Identity 子组件以同一比例画布适配可用宽高，已启动的构图在 leaving 期间保留并随原舞台离场，不重播入场。布局与时间参数见 [UI 规范](../design-notes.md#跃迁模拟器)。`WarpRevealImage` 与 `useWarpRevealSource` 处理高清→轻量→中性占位的顺序回退；命途继续使用 Adapter 的 revealPathIcon／pathIconUrl，StarBig 没有星级长条回退，失败使用中性占位。图片组件的 limitToSourcePixels 默认 true，Artwork 继续按 naturalWidth／naturalHeight 与当前 DPR 限制显示；仅六个 Identity 装饰实例设为 false，以固定的 160px 命途 CSS 显示上限约束整个画布（最大宽约 280.70px），同步缩小五颗星并保留相对比例；原图尺寸、DPR、元数据缺失和资源回退均不扩大构图。仅当前项挂载图片，identity 时可预加载当前 Artwork；语言引起的等价元数据对象不会重置请求。`useWarpPixelRatio` 继续订阅 resolution、窗口和 visualViewport 变化。PrimeVue Dialog 提供模态、滚动锁和焦点陷阱，内部原生按钮覆盖全屏、支持点击和键盘；纯黑背景与 contain 适配不使用概率或物品 ID 特判。页面在演出及隐藏完成前保持 inert 和抽取锁，after-hide 释放门控后恢复原抽取按钮焦点。原 `useWarpOverlay` 继续仅负责 Drawer／详情等原有交互，不承担演出状态。

确定性机制验证与人工清单见 [Phase 1I 报告](../investigations/warp-simulator/phase-1i-reveal-quality-fixes.md)，初次演出实现记录见 [Phase 1H](../investigations/warp-simulator/phase-1h-reveal-animation-and-ui-polish.md)。正式 Snapshot 已包含五星光锥，展示目录随当前可达物品显式同步；测试图中的合成身份和复用封面仍不进入生产候选池或资源快照。

## 展示资源与降级

[visuals](../../src/tools/warp-simulator/data/visuals/)为独立的规范化展示快照，来源锁定和显式离线维护见[游戏数据指南](../game-data.md#warp-展示资源)。它不表达抽取资格，不修改引擎输入，不在普通构建中生成。共享头像的复用仅发生于维护阶段；运行时无排轴业务导入或原始来源依赖。

`createPresentation(snapshot, visuals?, base?, definitions?)` 继续按 canonical ID 从 Warp Snapshot 取得名称、类别、稀有度，另外返回命途内部 ID／本地化名称／图标、角色属性内部 ID／名称／图标／原色／可读色、头像、立绘／封面及星级图片 URL。物品路径只由登记的安全 `game-assets/*.webp` 相对路径与 BASE_URL 组合。光锥无属性；缺失元数据和加载失败均使用中性占位，不猜测资源。

Catalog 的可选演出字段为 items[id].revealArtwork、paths[id].revealIcon、revealStars[5] 和 revealStarBig，统一保存 path／width／height；兼容原 schemaVersion 1。Adapter 对应提供 revealArtwork／revealPathIcon／revealStars／revealStarBig，均为 url／width／height，不替换 artworkUrl／pathIconUrl／starsUrl。revealStarBig 只提供给五星，所有命途共用同一派生图；旧 revealStars 映射保留，V3 Identity 显式选择新字段。普通卡片与详情不选择演出字段；只有演出图片组件发出相关请求。离线资源 Manifest 校验用途、转换参数、源／输出尺寸、不放大、哈希和引用覆盖，详见[资源维护](../game-data.md#warp-展示资源)。

裁切星级 cardStars[3/4/5] 同样使用 path／width／height；Adapter 提供可选 cardStars 图片描述与 cardStarsReferenceAspectRatio，后者取裁切五星图宽高比，缺失时以 5 保守限制。卡片的两行 Metadata 信息簇和最终 Artwork 信息面板选择 cardStars，资源缺失／失败使用中性占位；历史、详情仍使用旧 starsUrl，V3 Identity 使用独立 StarBig。WarpVisualIcon 的 image／referenceAspectRatio 可选输入由结果卡和最终 Artwork 信息面板启用，按共同参考比约束三档高度；旧 url／stars 调用保留原行为。Manifest v3 保留裁切追溯，维护规则见[资源维护](../game-data.md#warp-展示资源)。这些元数据派生不调用 RNG 或修改会话。

`useWarpOverlay` 只管理互斥 Drawer、Dialog 进入队列及恢复焦点 ID，不引用会话或 RNG。控制与历史默认收起，结果区域和常驻抽取栏保持挂载；打开／关闭面板不会重建 `useWarpSimulator` 或结果批次。Dialog 先等待 Drawer 的 after-hide，关闭后恢复来源面板／触发项；浮层关闭后的 DOM 焦点恢复只在页面层执行。星缘头像／空状态按钮沿用原队列；关闭后若原触发项已消失，页面将焦点回退到首个可用头像。星缘 Dialog 内手动移除失效角色后，在下一次 DOM 更新恢复搜索输入焦点，避免焦点留在已移除的按钮上。

结果卡为图像与 Icon 构成的可激活横向卡；Tooltip、ARIA 和共用 `WarpItemDetails` 提供完整文字及既有事件详情。历史共用同一 Presentation Adapter，五列语义表格保持最新优先；最新批次仍保持实际抽取顺序。抽取、分页、重置和历史容量继续使用页面会话；共享星缘配置独立于会话重置。

双语 UI 文案集中于 `warp.*`，官方命途／属性名称来自展示快照。语言、动画与资源加载不改变身份、UP 或 RNG。结果卡稳定 key 与 reduced-motion 规则保持不变，稀有度 Token 共用于结果卡和历史名称；历史正文 14px，名称 Hover／Focus 保留稀有度颜色。真实视觉、键盘／触屏、焦点及响应式由维护者人工验收。

会话持久化、导入导出、统计图表及粒子／镜头等复杂演出仍未实现；真实 Banner 的后续维护需单独审阅，不自动进入下一阶段。
