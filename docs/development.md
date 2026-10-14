# 开发与维护指南

项目概览见[根 README](../README.md)，专题入口见[文档导航](README.md)。Agent 操作遵守 [AGENTS.md](../AGENTS.md)。

## 开发环境与启动

使用 Node.js 24.x（当前 [package.json](../package.json) 要求 `>=24.12.0 <25`）与 npm。
依赖版本由 package.json 和唯一的 [package-lock.json](../package-lock.json) 管理；使用锁文件安装，不顺带升级依赖。

```bash
npm ci
npm run dev
```

以终端显示的本地地址为准。开发与预览命令绑定 `127.0.0.1`；首页为 `/`，行动序列模拟器为 `/action-planner`。
默认语言为简体中文，运行时可切换 English；语言选择不持久化。

预览使用已生成的静态构建：

```bash
npm run build
npm run preview
```

`build` 输出 `dist/`。应用使用 Vue Router History；将来选择宿主时需要支持 SPA 深链接回退。此要求不代表已配置部署、域名或线上地址。

## 常用命令

以下定义以 [package.json 的 scripts](../package.json) 为准，按变更选择检查，不作为每次任务的完整执行清单。

| 命令                                 | 用途                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm ci`                             | 按锁文件安装依赖                                                    |
| `npm run dev` / `npm run preview`    | 本地开发 / 预览已有构建                                             |
| `npm run type-check`                 | Vue、应用与工具配置的 TypeScript 检查                               |
| `npm test`                           | Vitest 确定性单元测试                                               |
| `npm run lint`                       | ESLint，只检查、不自动修复                                          |
| `npm run format:check`               | 按现有忽略项检查 Prettier 格式                                      |
| `npm run format`                     | 全仓格式写入，仅在明确需要时执行                                    |
| `npm run validate:i18n`              | 校验双语消息结构、参数与语法                                        |
| `npm run validate:game-data`         | 校验快照、Manifest、来源锁定、文件哈希及图片                        |
| `npm run validate:planner-templates` | 校验人工审阅的方案模板和双语介绍                                    |
| `npm run build`                      | 将现有应用和快照构建至 dist，不生成游戏数据                         |
| `npm run update:game-data`           | 显式数据更新；参数和前提见[游戏数据维护](game-data.md#显式更新流程) |
| `npm run bench:engine`               | 可选的引擎性能探针，不设机器相关硬阈值                              |

## 上游仓库与网络

正常安装、开发、测试和构建不读取相邻的 HSR-Database、TurnBasedGameData 或 StarRailRes，也不触发下载、生成或旧站构建钩子。
只有显式更新游戏快照时需要与 Source Lock 匹配的 StarRailRes 本地来源；其他仓库用于只读调查与来源追溯。

维护者当前本地网络使用 `http://127.0.0.1:7890` 系统代理；这不是所有使用者必须具备的环境。
需要该代理时，可仅对本次安装指定参数：

```bash
npm ci --proxy=http://127.0.0.1:7890 --https-proxy=http://127.0.0.1:7890
```

其他环境按实际网络配置安装。不要把私有路径、Token 或本地部署状态提交到仓库；Agent 联网与代理失败处理以 AGENTS.md 为准。

## 验证策略

引擎修改优先运行相关确定性单元测试；保留基础隔离测试与 11 个历史迁移用例。新功能选择少量高价值案例，不新增大量 UI 快照、CSS 断言或逐字绑定可变文案的测试。

定向测试使用已有 npm 入口，例如：

```bash
npm test -- tests/unit/planner-document-file.test.ts tests/unit/planner-persistence.test.ts
```

消息修改运行 i18n 校验；模板修改运行模板校验及方案文件相关测试；数据维护按游戏数据指南验证。
代码变更按范围选择类型检查、lint、格式检查与构建，不将历史报告中的一次通过结果当成本次验收。

Codex 默认不执行 Computer Use、Playwright、Puppeteer、真实浏览器截图或其他浏览器自动化；普通测试命令不触发浏览器测试。
只有用户明确要求某次浏览器自动化验收时才例外。UI 视觉与真实交互由用户在本地人工验收，建议覆盖 1440px、1024px、390px 和两种语言。

## 文档修改的检查

纯文档修改只需核对内容、Markdown 结构、内部链接、标题锚点与 `git diff --check`，不要求更新数据、Benchmark、单元测试、Production Build 或浏览器验收。

现有 [.prettierignore](../.prettierignore) 排除了部分历史及第三方文档。定向检查实际编辑的 Markdown 时，用现有 .gitignore 替代忽略文件：

```bash
npm exec -- prettier --ignore-path .gitignore --check README.md docs/README.md docs/development.md
```

需要格式修复时仅对实际变更文件使用 `--write`，不全仓重排历史报告，也不修改许可证文本。
临时链接检查脚本放系统临时目录，不为文档任务安装新工具链。
