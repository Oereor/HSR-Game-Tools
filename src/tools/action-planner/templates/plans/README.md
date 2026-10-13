# 正式配队方案

这里只放用户人工审阅后的 Version 2 JSON（兼容已有 Version 1）。当前没有正式模板；测试虚构方案不得加入此目录。

在工具中配置并导出方案，将 JSON 放入此处，在 `../catalog.ts` 显式导入并登记 ID、顺序、名称／简介 Message Key 和 `file`。在中英文 Site Messages 添加对应介绍，执行 `npm run validate:planner-templates`。

模板使用普通文档解析器；加载获得独立的可编辑文档，不与源文件持续同步。
