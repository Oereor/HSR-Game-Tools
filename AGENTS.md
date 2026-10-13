# HSR-Game-Tools working rules

## Repository and phase boundaries

- This is the independent HSR-Game-Tools repository. Modify only this repository within the user's authorized scope.
- Phase 1A, the accepted Phase 1B-0 design system, Phase 1B-1 functional editor, current queue reconstruction, Phase 2A persistence / reviewed team templates / initial enemy setup and Phase 2B MoC / AA cycles are authorized. Keep the existing engine capabilities; do not add character-specific mechanics, cross-wave systems, cloud sync, multi-plan libraries, other simulators or deployment without a new request.
- HSR-Database, TurnBasedGameData and StarRailRes are read-only investigation sources. Never edit, format, stage, commit, reset, clean, switch branches or run mutating generation commands in them.
- Read HSR-Database/develop at a recorded Commit. If another branch is checked out, inspect develop through Git without changing the checkout.
- Never initialize Git in the shared parent directory or make sibling repositories submodules or subtrees.
- Do not stage, commit, add remotes, push, publish, deploy or configure domains unless separately requested. Initial repository creation was authorized; publication was not.

## Networking

- Use the user's existing system proxy for every network operation; the current default is http://127.0.0.1:7890.
- Verify connectivity first. A sandbox denial is not proof that the proxy is unavailable: use an appropriate approved execution permission when necessary.
- Do not bypass the proxy when it fails. Report the unavailable verification rather than trying direct connections.

## Architecture and data ownership

- The intended stack is Vue 3, TypeScript, Vite, Vue Router and Tailwind CSS 4 in a single Web app.
- Keep the simulation engine pure TypeScript. It must not import Vue, Router, localization, loaders, Node filesystem APIs or raw game JSON.
- Preserve existing AG/SPD/AV, ordering, effect phases, lifecycle, stable identity and Trace semantics. Round numbers only in presentation.
- UI reads normalized tool-owned data. Raw upstream parsing belongs only in an explicitly invoked updater.
- Daily install, dev, test and build commands must not require sibling repositories or silently trigger data downloads/generation.
- Keep lightweight normalized snapshots, necessary assets and their provenance Manifest trackable; ignore only updater caches and staging output. Do not stage or commit them in this task.
- Names, IDs and images come from checked sources. Preset effects and applicability remain tool-owned rules, never inferred by an engine from skill descriptions.
- Retain source notices when copying code or data. Do not equate a repository's software license with permission to redistribute game artwork.

## Verification and reporting

- UI 视觉和真实浏览器交互由用户负责人工验收。Codex 默认不执行 Computer Use、Playwright、Puppeteer、浏览器截图或其他繁琐的真实浏览器自动化验收。开发时优先使用类型检查、定向单元测试、静态检查与构建验证。完成后提供简洁的人工验收清单，由用户在本地浏览器中检查。
- 只有用户以后明确要求某一次浏览器自动化验收，才可以例外执行。未来 Codex Prompt 默认遵循此政策；不得为默认验收安装额外浏览器工具，普通测试命令不得自动触发浏览器测试。
- Prefer existing deterministic mechanism tests and a small set of migration comparisons; avoid large UI snapshots, CSS assertions or tests of mutable copy.
- Baseline generation and isolation verification belong in the system temporary directory. Project-local tooling caches may use .cache. Never execute the old site's Vite plugins or build hooks.
- Mark conclusions as code-reviewed, actually run, or pending Phase 1. Do not call an isolated probe full application acceptance.
- Finish by comparing the original branch, HEAD and worktree status of all three source repositories and inspecting the new repository's files and Git status.

Use Node 24 (minimum 24.12), npm and one package-lock.json. No Pinia, SSR or parent-directory runtime dependencies. Phase 0 remains historical evidence; the Phase 1A report must distinguish measured results from pending UI/deployment and licensing acceptance.

## Action Planner and design system

- Use PrimeVue 4.5.5 Styled Mode with @primeuix/themes 2.0.3, Tailwind CSS 4 and @lucide/vue. Keep direct dependency versions exact; do not mix theme major versions or reintroduce deprecated @primevue/themes.
- Centralize theme tokens in src/theme/preset.ts. Keep .app-dark on the document root; PrimeVue and Tailwind share the selector and the theme/base/primevue/components/utilities layer order.
- Basic controls belong to PrimeVue; workspace layout and semantic operation/action cards belong to the tool. Avoid broad internal .p-* overrides, full component/icon registration and unnecessary wrapper libraries.
- useActionPlanner owns one PlannerDocument: SimulationPlan plus tool-only operation names and Actor-to-character ID metadata. Derived results, catalogs, diagnostics and queue snapshots are not a second business configuration. All plan edits replay the engine; name-only metadata edits do not.
- Battle setup is an explicit Apply draft. Node/stage/navigation-mode changes discard operation drafts without confirmation; cancel preserves committed data. Preserve operation IDs on edits and Actor IDs on speed edits. Character replacement gets a new Actor ID; retain old events and report invalid references instead of rebinding them.
- Target eligibility comes from engine targeting.ts and previewOperationState at the selected anchor, phase and operation position. Recover failed-node context only through existing engine replay APIs. Never substitute the final participant catalog for execution state.
- Maintain UI copy in src/locales/zh-CN.json and en.json; pure naming/metadata functions return semantic descriptors, translated by Presentation through vue-i18n. Never embed bilingual sentences in models, persist automatic titles, translate user names or use translated text as business identity. Validate both catalogs with npm run validate:i18n; test keys/parameters instead of mutable copy.
- Action-change icons match committed targetAnchor traces for advance, delay and immediatelyAct. Show every legal applied effect even when AG/AV/order did not change; types may coexist. Invalid/skipped/failed effects do not produce markers. Configured-operation markers have separate semantics. Keep queue mathematics and atomic commit behavior intact.
- New ordinary drafts default to postAction; preserve explicit or implicit legacy preAction on edits. Inspector metadata comes from configuration and cached execution context, independently of custom titles. Preserve complete target access, all four toolbar buttons, localized tooltips and input error associations.
- Action cards use camp dots and border/background selection with aria-pressed; selected target-picker entries retain checkmarks. Read docs/design-notes.md before extending the UI language.
- Preserve foundation tests and the 11 migration cases alongside engineering checks including validate:i18n; isolate additive immediate-action traces in the historical comparison and verify them directly. Leave real configuration flows and 1440/1024/390px visual acceptance to the user's local browser checks. Report unimplemented features and unverified behavior explicitly; do not start subsequent phases automatically.
- Current queue presentation reads the initial post-start snapshot or NodeRecord.beforeEffects, with the active record above waiting entries. Keep queueCursor separate from Inspector selection, retain anchors across replay and mode switches, and fall back to start when the queue anchor becomes unreachable. Never rebind operations by array index or change the engine's post-settlement snapshot semantics for presentation.
- PlannerDocument owns the committed plan name, plan and metadata. Local autosave, JSON import/export and reviewed templates share the Version 2 envelope and the document-file.ts boundary. Strict Version 1 migration adds cycleMode: none; never relax unknown-field checks. Never persist results, traces, navigation or drafts. Validate before replacing; keep runtime diagnostics and orphan operations.
- Restore local storage before enabling the shallow commit watcher. Protect corrupt / unsupported saves, pause on external changes and compare the storage baseline before writing. Overwrite requires an explicit UI choice and a current storage token. Export and teardown must not rewrite storage.
- Initial setup allows 0–4 allies and 0–5 enemies with camp-local positions. Apply the full roster and budgets together; edits remain drafts. Imported initial enemies use baseSpeed for both speed fields, without a difference hint. Retain other actor fields, stable IDs and orphan references; do not apply the initial enemy limit to dynamic spawns.
- Reviewed templates are ordinary exported JSON with catalog metadata and Site Messages. Keep the production catalog empty until reviewed content is provided; never infer teams or skill effects from screenshots. Run validate:planner-templates with document tests.
- Cycles belong to SimulationPlan and the existing Apply draft. MoC boundaries are 150 + 100(n-1) AV; AA boundaries are 300 + 100(n-1) AV, starting with cycle 0. Cycle boundaries are independent system events, never Participants or targets. They use stable cycleBoundary ordinal anchors, count toward maxNodes and settle after all ordinary events at the same AV, including newly inserted zero AV actions. Their operations use one phase-free window and the ordinary execution path. Never reset AG or decrement turn buffs at a system event. Retain disabled cycle operations in a separate inactive list. Cross-wave reset/retention is not implemented.
