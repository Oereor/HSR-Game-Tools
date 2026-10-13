# HSR-Game-Tools working rules

## Repository and phase boundaries

- This is the independent HSR-Game-Tools repository. Modify only this repository within the user's authorized scope.
- Phase 1A, the accepted Phase 1B-0 design system and Phase 1B-1 functional Action Planner editor are authorized. Keep the existing engine capabilities; do not add character-specific mechanics, persistence, other simulators or deployment without a new request.
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
- Automatic bilingual names and target counts are pure Presentation functions; custom names key by operation ID, independent of entity names. Arrows use Trace matching targetAnchor, including both directions and zero-AV insertion; configured-operation markers have separate semantics.
- Keep both zh-CN and en labels, accessible icon-button names, InputNumber error associations and a non-color selected indicator. Read docs/design-notes.md before extending the UI language.
- Verify 1440/1024/390px in a real browser, real configuration flows and static preview, alongside the six engineering checks. Preserve the 67 foundation tests and 11 migration cases. Report unimplemented features and unverified behavior explicitly; do not start subsequent phases automatically.
