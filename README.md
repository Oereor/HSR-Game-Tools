# HSR-Game-Tools

《崩坏：星穹铁道》的非官方游戏工具集合，支持简体中文与英文。
项目为静态 Web 应用，正式部署地址尚未确定。

## 工具

### 行动序列模拟器 / Action Order Simulator

已实现，入口为 `/action-planner`：

- 编队与速度配置。
- 自定义行动效果与行动顺序模拟。
- 混沌回忆（MoC）与异相仲裁（AA）轮次。
- 方案 JSON 导入、导出与本地自动保存。

模拟器依照用户配置推演行动顺序，不自动执行完整游戏技能。

### 抽卡模拟器 / Warp Simulator

规划中，尚未迁移；首页仅提供静态预览。

### 遗器模拟器 / Relic Simulator

规划中，尚未迁移；首页仅提供静态预览。

## 技术栈

Vue 3、TypeScript、Vite、Vue Router、PrimeVue、Tailwind CSS 4、vue-i18n、Lucide Icons，以及 Node.js 24 / npm。
具体版本由 [package.json](package.json) 与 [package-lock.json](package-lock.json) 管理。

行动序列引擎是独立的纯 TypeScript 模块。正常开发、测试和构建使用仓库内快照，无需相邻的上游数据仓库。

## 快速开始

需要 Node.js 24.x，最低版本以 [package.json](package.json) 的 `engines` 为准。

```bash
npm ci
npm run dev
```

按终端显示的地址访问；环境、验证与预览步骤见[开发指南](docs/development.md)。

## 文档

从[文档导航](docs/README.md)进入现行架构、UI 规范、文案与数据维护指南及历史报告。
使用 Agent 开发时遵守 [AGENTS.md](AGENTS.md)。

## 数据来源与致谢

- [HSR-Database](https://github.com/Oereor/HSR-Database)：衍生引擎与部分编辑辅助代码，以及有限的名称、别名投影。
- [StarRailRes](https://github.com/Mar-7th/StarRailRes)：规范化游戏数据及角色、装备视觉资源。
- [TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData)：机制与字段调查参考，不是日常构建输入。
- [HSR-Action-Planner](https://github.com/THyanNK/HSR-Action-Planner)：行动序列模拟器早期产品设计的灵感来源，本工具不是其官方版本。

代码、数据、图片和图标的具体来源与固定版本见[第三方来源说明](docs/third-party/README.md)。

## 许可与免责声明

本项目整体许可证尚未确定；已有第三方许可通知继续有效。
第三方游戏数据、图片与游戏知识产权归各自权利人所有，来源仓库的软件许可不能替代游戏素材再分发授权。

本项目与《崩坏：星穹铁道》及其相关方无官方关联。模拟结果仅供参考，不保证与游戏内表现完全一致。
公开发布前待确认事项见[第三方来源与许可](docs/third-party/README.md#发布前待确认事项)。
