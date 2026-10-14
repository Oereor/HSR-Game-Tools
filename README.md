# HSR-Game-Tools

《崩坏：星穹铁道》的非官方游戏工具集合，支持简体中文与英文。

## 工具

### 行动序列模拟器 / Action Order Simulator

已实现，入口为 `/action-planner`：

- 编队与速度配置。
- 自定义行动效果与行动顺序模拟。
- 混沌回忆（MoC）与异相仲裁（AA）轮次。
- 方案 JSON 导入、导出与本地自动保存。

### 抽卡模拟器 / Warp Simulator

正在施工中。

### 遗器模拟器 / Relic Simulator

正在施工中。

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

- [StarRailRes](https://github.com/Mar-7th/StarRailRes)：规范化游戏数据及角色、装备视觉资源。
- [HSR-Action-Planner](https://github.com/THyanNK/HSR-Action-Planner)：行动序列模拟器早期产品设计的灵感来源，并参考了其实现方式。

## 许可与免责声明

本项目自行编写且拥有许可权的代码及配套文档采用 [MIT License](LICENSE)。
第三方代码、游戏数据、图片和其他资源遵循各自适用的许可与权利归属，详见[第三方来源与许可](docs/third-party/README.md)。
游戏知识产权归各自权利人所有，来源仓库的软件许可不能替代游戏素材再分发授权。

本项目与《崩坏：星穹铁道》及其相关方无官方关联。模拟结果仅供参考，不保证与游戏内表现完全一致。
