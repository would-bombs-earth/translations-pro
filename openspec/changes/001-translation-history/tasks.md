# 实施任务 — 翻译历史记录

## 阶段 1：存储层

- [ ] **1.1** 在 `background-api.js` 中扩展 `getIDB()`：新增版本迁移逻辑（1→2），创建 `history` store 及其索引（timestamp, domain, type）
- [ ] **1.2** 新建 `export async function recordHistory(entry)`：生成 `id` 和 `timestamp`，写入 IndexedDB，带容量控制（超 5000 条时删除最旧记录）
- [ ] **1.3** 新建 `export async function queryHistory(opts)`：支持参数 `{ domain?, offset?, limit? }`，返回 `{ entries, total }`，按 timestamp 降序排列
- [ ] **1.4** 新建 `export async function clearHistory()`：清空整个 history store
- [ ] **1.5** 新建 `export async function getHistoryStats()`：返回 `{ total, today, engineCounts }`
- [ ] **1.6** 新建 `export async function deleteHistoryEntry(id)`：按 ID 删除单条记录
- [ ] **1.7** 实现去重 LRU Set（60 秒窗口，内存级）

## 阶段 2：记录集成

- [ ] **2.1** 在 `google()` 函数成功路径末尾调用 `recordHistory()`，每批次逐条记录（注意批次粒度：`_applyTr` 返回的 pairs）
- [ ] **2.2** 在 `quickTranslate()` 成功路径末尾调用 `recordHistory()`，type=`"selection"`
- [ ] **2.3** 在 `lookupWord()` 成功路径末尾调用 `recordHistory()`，type=`"word"`
- [ ] **2.4** 缓存/IDB 命中路径也调用 `recordHistory()`，但 engine 标记为 `"(cache)"` / `"(idb)"`

## 阶段 3：消息路由

- [ ] **3.1** 在 `background.js` 消息路由中新增 `get_history` 处理：调用 `queryHistory()`，返回结果
- [ ] **3.2** 新增 `clear_history` 处理：调用 `clearHistory()`，返回 `{ ok: true }`
- [ ] **3.3** 新增 `get_history_stats` 处理：调用 `getHistoryStats()`，返回统计
- [ ] **3.4** 新增 `delete_history_entry` 处理：调用 `deleteHistoryEntry(id)`，返回 `{ ok: true }`
- [ ] **3.5** 新增 `set_history_enabled` 处理：存储启用状态到 `chrome.storage.local`

## 阶段 4：UI — 弹出面板

- [ ] **4.1** 在 `options.html` 中新增"翻译历史"菜单项（时钟图标）+ 展开面板容器
- [ ] **4.2** 在 `options.html` 中新增面板内部结构：统计摘要、域名过滤、列表区、分页、操作按钮
- [ ] **4.3** 在 `options.js` 中实现 `loadHistory()`：调用 `chrome.runtime.sendMessage({ type: 'get_history' })`，渲染列表
- [ ] **4.4** 实现 `loadHistoryStats()`：调用 `get_history_stats`，更新统计摘要
- [ ] **4.5** 实现条目点击展开/收起（显示完整原文/译文）
- [ ] **4.6** 实现单条删除（调用 `delete_history_entry`，局部刷新）
- [ ] **4.7** 实现"清空历史"按钮（二次确认 → 调用 `clear_history`）
- [ ] **4.8** 实现"导出历史"按钮（JSON 文件下载）
- [ ] **4.9** 实现域名过滤（受控输入 → 重新查询）
- [ ] **4.10** 实现分页控制（上一页/下一页 + 当前页码）
- [ ] **4.11** 实现 "记录翻译历史" 切换开关，持久化状态
- [ ] **4.12** 实现空状态展示

## 阶段 5：样式

- [ ] **5.1** 新增 `.history-list` / `.history-item` 样式：暗色列表行、悬浮高亮
- [ ] **5.2** 引擎标签样式：复用 `.eng-card-latency` 颜色体系
- [ ] **5.3** 时间戳样式：小号、`var(--sub)` 颜色
- [ ] **5.4** 原文/译文行样式：多行截断（2 行）、展开动画
- [ ] **5.5** 分页按钮样式：与 `.kv-sync-act-btn` 一致
- [ ] **5.6** 统计摘要行样式：数字强调色 + 小号标签

## 阶段 6：验证

- [ ] **6.1** 手动测试：打开外文页面 → 自动翻译 → 打开弹出面板 → 查看历史 → 确认条目完整
- [ ] **6.2** 手动测试：划词翻译 → 确认 type=`"selection"` 条目出现
- [ ] **6.3** 手动测试：清空历史 → 确认列表清空 → 新翻译后重新出现
- [ ] **6.4** 手动测试：关闭"记录翻译历史" → 翻译页面 → 历史无新条目
- [ ] **6.5** 手动测试：导出历史 → 确认 JSON 格式正确
- [ ] **6.6** 手动测试：单条删除 → 确认条目消失且总数减少
- [ ] **6.7** 边界测试：5000+ 条时最旧记录被自动删除
- [ ] **6.8** 边界测试：域名过滤功能正常
- [ ] **6.9** 边界测试：扩展重启后历史数据保留
