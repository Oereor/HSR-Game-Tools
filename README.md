# HSR-Game-Tools

《崩坏：星穹铁道》独立游戏工具站，使用 Vue 3、TypeScript、Vite、Vue Router、Tailwind CSS 4 和 vue-i18n。

当前已完成 **Phase 1B-0：组件库与设计系统 Spike**。`/action-planner` 提供 PrimeVue Styled Mode + Aura 深色金色主题的可交互原型；Phase 1A 的纯引擎、规范化快照和数据验证保持可用。正式 Action Planner 编辑器尚未实现。

## 本地运行

需要 Node 24（最低 24.12，验证版本 24.21.0）与 npm，使用唯一 `package-lock.json`。

```sh
npm ci
npm run dev
```

按照终端显示的本地 URL 打开首页或 `/action-planner`。安装只需访问 npm 注册表；正常开发、测试和构建不需要三个来源仓库。语言默认简体中文，可以运行时切换 English；当前不保存语言选择、原型操作或排轴方案。

本地特殊网络环境下，安装应使用系统代理，例如：

```sh
npm ci --proxy=http://127.0.0.1:7890 --https-proxy=http://127.0.0.1:7890
```

参数只作用于本次命令，不修改全局 npm 配置；其他开发环境按自己的代理设置安装。

## 检查与静态构建

```sh
npm run type-check
npm test
npm run lint
npm run format:check
npm run validate:game-data
npm run build
npm run preview
```

`build` 输出 `dist/`，只打包现有快照，不下载数据或重新转换图片；发布前应运行上述数据校验。History 路由需要宿主配置 SPA fallback，本轮仅完成本地 dev／preview 验收。

`npm run format` 用于明确需要的格式修复，lint 默认不写文件。`npm run bench:engine` 输出少量性能探针，不设置机器相关硬阈值。

## 显式更新游戏数据

当前固定版本快照包含 98 个角色、3 个预设与 101 张 WebP。角色图保留 256×256，装备图保留 128×128，不放大。转换参数位于独立 source lock，可调整并升级版本。

```sh
npm run update:game-data -- --source local --root "/absolute/path/StarRailRes"
npm run validate:game-data
```

指定目录必须是干净的 Git 根目录，HEAD 匹配 `scripts/game-data/source-lock.json`。更新器不 fetch、不切分支、不修改来源、不自动提交；生成后先校验，再替换快照和图片，异常时回滚，更新锁阻止并发执行。

缺图时省略对应 URL 并记录诊断；缺速度留空，不猜游戏数值。新增角色 ID 需要审阅 source lock；名称／别名配置保留来源记录。远程下载模式尚未实现。

建议停止 dev／preview 后更新，再启动或刷新。多目录替换不是对浏览器的全局原子操作。进程被强制终止可能遗留 `.game-data-staging/update.lock` 和备份；确认没有更新进程、检查 run ID 和备份后再人工恢复，不自动清理他人的锁。

## 架构与阶段边界

- `src/engine/action-planner/`：纯 TypeScript 引擎，不依赖 Vue、DOM、Node 文件系统、游戏数据或翻译。
- `src/tools/action-planner/`：纯编辑辅助、预设、轻量搜索、展示格式与页面级 Composable。
- `src/data/`：工具 schema、已生成快照和 adapter，原始索引只在更新器解析。
- `public/game-assets/`：有限本地图片，不请求上游 CDN。
- `scripts/`：显式更新、校验和性能探针，没有隐藏的数据更新钩子。

## 原型人工验收

打开 `/action-planner`，默认进入行动规划。顶部 Tabs 可切换战斗配置；四人槽位、角色 Dialog、速度和推演范围输入只验证本地 UI 状态。

行动列表由固定的四人示例计划计算，包含提前、延后、速度修正和一次性事件；不是角色技能建模。点击节点更新 Inspector，添加或编辑操作进入完整编辑视图。速度效果支持固定值／百分比与回合／倒计时持续；提交和删除只更新原型操作卡，不写入 `SimulationPlan`，也不改变固定 AV。编辑时切换节点或工作阶段直接丢弃草稿，取消编辑不修改已提交数据。刷新重置原型。

桌面可拖动 Splitter，也可聚焦分隔柄并持续按左右方向键；PrimeVue 4.5.5 内置键盘重复器间隔为 40ms，极短的单击按键可能不生效。低于 960px 使用上方限高行动列表、下方 Inspector。

本轮不包含真实敌人选择、完整角色搜索、全部引擎操作编辑器、其他模拟器、方案保存或导入导出。控件主题、图标和布局约定见 [Design Notes](docs/design-notes.md)。截图保存在本地 `.cache/phase-1b/`，不属于正式应用资源。

## 报告与第三方来源

- [Phase 0 架构调查](docs/investigations/phase-0-migration-architecture.md)
- [Phase 1A 实施与隔离验收](docs/investigations/phase-1a-independent-foundation.md)
- [Phase 1B-0 组件库验证与浏览器验收](docs/investigations/phase-1b-component-library-spike.md)
- [第三方来源、许可证文本与发布限制](docs/third-party/README.md)

整体项目许可证尚未确定。复制的引擎保留 MIT 通知；StarRailRes 索引许可与游戏美术授权需分别处理。当前数据和图片用于本地验证，未经确认不得擅自提交、推送或公开分发第三方资源。本轮没有发布或配置 Vercel。
