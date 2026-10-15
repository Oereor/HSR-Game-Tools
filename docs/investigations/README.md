# 历史调查与实施报告

本目录保存各阶段的调查、设计决策、实现结果和验证证据；现行入口见[文档导航](../README.md)。
报告中的“当前”“尚未实现”“推荐方案”、版本、数量、测试结果及浏览器记录只描述其原日期与阶段。
维护当前系统时以[现行架构](../architecture/action-order-simulator.md)、[UI 规范](../design-notes.md)和对应维护指南为准，不用阶段报告覆盖今天的契约。

## 迁移与独立工程

- [Phase 0 独立迁移架构调查](phase-0-migration-architecture.md)：旧工程取证、迁移边界、来源固定与早期方案。
- [Phase 1A 独立工程基础](phase-1a-independent-foundation.md)：引擎迁移、规范化数据与工程隔离验证。

## UI 组件库与编辑器

- [Phase 1B-0 组件库与设计系统](phase-1b-component-library-spike.md)：PrimeVue 原型和主题选型验证。
- [Phase 1B-1 真实编辑器](phase-1b-functional-action-planner-editor.md)：配置、操作编辑、响应式与原阶段验收。

## 持久化与初始编队

- [Phase 2A 方案、模板与敌方编队](action-planner-persistence-templates-enemy-setup.md)：Version 1 当时的文件边界、自动存档与初始敌人接入。

## 轮次系统

- [Phase 2B Endgame 轮次](action-planner-endgame-cycle-system.md)：MoC / AA 边界与当时 Version 2 的实现记录。

## 阿哈时刻

- [Phase 2C-0 架构调查](action-planner-aha-instant-architecture.md)：阿哈设计与 Version 3 的实施前方案，不代表尚未接入。
- [Phase 2C-1 功能实施](action-planner-aha-instant-implementation.md)：阿哈身份、派生速度、生命周期和 Version 3 接入验证。

## UI 与 Presentation 优化

- [UI Polish 与 Site Messages](action-planner-ui-polish-localization.md)：语义命名、Metadata、目标与交互收敛。
- [当前队列重构](action-planner-current-queue-view-reconstruction.md)：事件入口状态、独立队列游标与展示修复。
- [速度 Modifier Tag 展示](action-planner-speed-modifier-visualization.md)：实际生效效果、持续信息与无障碍呈现。

## 文档收尾

- [部署前文档整理](pre-production-documentation-closeout.md)：现行文档体系、迁移去向、准确性与文档验证结果。
- [第三方来源与发布通知现状](../third-party/README.md)：项目 MIT 与独立第三方条款、静态产物通知及发布前待确认事项。
- [部署前深度清理与 Vercel 准备](pre-deployment-deep-cleanup.md)：Dead Code、测试与动态消息审查、SPA Rewrite 和部署前工程验证。

以上原有 11 份报告保持原路径、结论、测试数据及来源 Commit，不批量搬迁、合并或格式化。
新增功能的当前规则进入现行规范；实施经过与实验结果继续按主题记录于此，并从索引提供入口。

## 上线后工程维护

- [CI/CD 基础接入](post-production-cicd-foundation.md)：Vue Web Analytics、轻量 Validation CI、手动 Preview、main 自动 Production 与控制台初始化步骤。

## 通用离场与批量预设

- [离场、事件变速与卡厄斯兰那预设](action-planner-off-field-khaslana-preset.md)：AG 冻结、事件独立速度基数、跨节点原子提交、Version 3 兼容与人工验收清单。

## Warp Simulator

- [Phase 0 架构与概率模型调查](warp-simulator/phase-0-investigation.md)：旧实现取证、来源与规则证据边界。
- [Phase 1 数据基础设施](warp-simulator/phase-1-data-foundation.md)：独立轻量目录、人工 JSONC、IntelliSense、验证和静态快照。
