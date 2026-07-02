# UI 规范

## 弹出面板入口

在 `options.html` 的菜单中新增一个可点击项，位于"导出译文"和"导出日志"之间：

```
图标: 时钟/历史 (svg)
标签: 翻译历史
子标题: 显示翻译活动记录
行为: 点击打开"翻译历史"展开面板
```

## 翻译历史面板

展开式面板，遵循现有 accordion 模式（与引擎/排除域名面板一致）：

### 面板内容

1. **统计摘要行**（顶部）
   - 总记录数
   - 今日翻译数
   - 当前选中引擎占比（如 "Google 78%"）

2. **域名过滤**（可选）
   - 下拉或输入框，输入域名过滤列表

3. **历史列表**
   - 每条显示：
     - 时间（相对时间："2分钟前" / "今天 14:32" / "昨天 09:15"）
     - 原文片段（截断 60 字符）
     - 译文片段（截断 60 字符）
     - 引擎徽标（小标签）
     - 类型图标（划词/页面）
   - 分页：每页 20 条
   - 点击条目可展开查看完整原文/译文

4. **操作按钮**
   - "清空历史"：确认对话框后清空所有记录
   - "导出历史"：导出为 JSON 文件

### 视觉风格

- 与现有暗色玻璃拟态保持一致
- 列表行：`background: var(--surface)`，悬浮 `var(--surface-hover)`
- 引擎标签：复用现有 `eng-card-latency` 的色谱（绿色=快/Google, 蓝色=微软）
- 时间文本：`color: var(--sub)`，字号 10px
- 原文/译文行：字号 11px，多行省略（`-webkit-line-clamp: 2`）

### 空状态

无历史记录时显示：

```
暂无翻译记录
开始翻译网页后，记录将在此显示
```

## 消息协议

新增以下消息类型的支持（background.js 消息路由）：

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `{ type: "get_history", domain?: string, offset?: number, limit?: number }` | popup → background | 查询历史记录，返回 `{ entries: [...], total: number }` |
| `{ type: "clear_history" }` | popup → background | 清空所有历史，返回 `{ ok: true }` |
| `{ type: "get_history_stats" }` | popup → background | 获取统计信息，返回 `{ total, today, engineCounts: {...} }` |
