# HSR-Game-Tools

《崩坏：星穹铁道》游戏工具的独立 Web 站点，计划统一容纳排轴模拟器、抽卡模拟器与遗器模拟器。

当前处于 **Phase 0：独立迁移架构调查**。本仓库只有调查报告与基础仓库配置，尚未创建应用、迁移引擎或安装依赖。

## 调查报告

[Phase 0 迁移架构调查](docs/investigations/phase-0-migration-architecture.md)记录文件级依赖、引擎契约、实际验证、游戏数据与资源方案、Vue 架构，以及 Phase 1 的实施顺序。

## 项目方向

- 使用 Vue 3、TypeScript、Vite、Vue Router、Tailwind CSS 4，建立单一 Web 应用。
- 首先迁移 HSR-Database/develop 中已经验证的 Action Planner TypeScript 引擎；引擎保持与 Vue、数据加载和本地化无关。
- 游戏数据和必要图片通过单独更新流程生成轻量静态快照。日常安装、开发、测试和构建应在没有旧站及上游仓库的环境中独立完成。
- 抽卡与遗器模拟器留待后续阶段，本阶段不迁入旧实现。

当前没有可执行的应用启动、构建或更新命令。报告中的命令和接口设计均明确区分本轮验证方法与 Phase 1 待实现功能。

## 来源与许可状态

排轴引擎的调查来源为 HSR-Database；游戏数据及资源的调查来源为 StarRailRes 与 TurnBasedGameData。报告记录了固定 Commit、现有许可证和归属信息。

本阶段尚未确定新项目许可证，也未在本仓库分发游戏数据或图片。第三方代码／索引的许可证不能替代游戏美术资源的授权；发布前需要完成报告列出的许可确认。
