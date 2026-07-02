# 记录规范

## 记录触发点

| 场景 | 代码位置 | 记录逻辑 |
|------|---------|---------|
| 页面批量翻译 | `background-api.js` → `google()` 函数成功返回后 | 对每一批次的翻译结果，拆分为单个原文‑译文对逐一记录 |
| 划词翻译 | `background-api.js` → `quickTranslate()` 成功后 | 记录一条 `type="selection"` |
| 单词查询 | `background-api.js` → `lookupWord()` 成功后 | 记录一条 `type="word"`，translatedText 包含释义 |
| 缓存命中 | `google()` 中的缓存/IDB 命中路径 | 记录但 `engine` 标记为 `"(cache)"` 或 `"(idb)"` |

## 去重策略

同一页面翻译期间，相同的 `sourceText` 在 **60 秒窗口内**不重复记录（通过 LRU Set 去重）。

去重仅在 background service worker 内存中进行，重启后重置。

## 异步写入

历史记录写入 IndexedDB 必须是异步非阻塞的：
- 不阻塞翻译响应返回
- 写入失败（如 IndexedDB 空间满）静默忽略，不影响翻译功能

## 记录接口

在 `background-api.js` 中新增导出函数：

```js
export async function recordHistory(entry)
```

接收一个符合存储规范中数据模型的对象（不含 `id` 和 `timestamp`，由函数内部生成）。
