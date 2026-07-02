# 存储规范

## 数据模型

每条翻译历史记录包含以下字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 主键，格式 `ts_${timestamp}_${random4}` |
| `timestamp` | `number` | 是 | 记录时间，`Date.now()` |
| `sourceText` | `string` | 是 | 原文 |
| `translatedText` | `string` | 是 | 译文 |
| `sourceLang` | `string` | 是 | 源语言代码（如 `"en"`、`"auto"`） |
| `targetLang` | `string` | 是 | 目标语言代码（固定 `"zh-CN"`） |
| `engine` | `string` | 是 | 使用的引擎：`"google"` / `"microsoft"` / `"google_basic"` / `"(cache)"` / `"(idb)"` |
| `domain` | `string` | 是 | 翻译发生时的页面域名（如 `"example.com"`） |
| `pageTitle` | `string` | 否 | 页面标题（可选，用于 UI 显示） |
| `type` | `string` | 是 | 翻译类型：`"page"`（页面翻译）/ `"selection"`（划词）/ `"word"`（单词查询） |
| `duration` | `number` | 否 | 翻译耗时（毫秒，仅非缓存请求） |

## 存储引擎

使用 IndexedDB，复用已存在的 `TranslationsProDB` 数据库，版本升级到 2，新增 `history` 对象存储。

**数据库升级逻辑**（在现有 `getIDB()` 基础上扩展）：

```
版本 1 → 2:
  创建 history store:
    keyPath: "id"
    索引: "timestamp" (unique: false)
    索引: "domain" (unique: false)
    索引: "type" (unique: false)
```

## 容量限制

- 最大保留 **5000 条**记录
- 超出时删除最旧记录（按 `timestamp` 升序删除）
- 每条记录 ≈ 200–2000 字节，5000 条 ≈ 1–10 MB

## 导出格式

支持导出为 JSON 格式数组，结构与数据模型一致。
