// background.js
// Service Worker — 右键菜单 / 标签状态 / 消息路由
// 翻译 API 逻辑在 background-api.js

import { google, pingBoth, getApiLogs } from './background-api.js';
import { kvGetDomains, kvPutDomains, getKvLogs } from './kv-sync.js';

// ── 控制台样式 ──
const _S_BG    = 'background:#0d9488;color:#fff;padding:1px 7px;border-radius:3px;font-weight:600';
const _S_BG_ERR = 'background:#ef4444;color:#fff;padding:1px 7px;border-radius:3px;font-weight:600';
const _S_TS     = 'color:#6b7280;font-weight:normal';

const _bgBuf = [];
const _bgBufMax = 500;
function _bgLog(method, tag, a) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}][${tag}][BG]`;
  const line = prefix + ' ' + a.map(x => {
    if (x === null || x === undefined) return String(x);
    if (typeof x === 'object') { try { return JSON.stringify(x); } catch (_) { return String(x); } }
    return String(x);
  }).join(' ');
  _bgBuf.push(line);
  if (_bgBuf.length > _bgBufMax) _bgBuf.shift();
  // 彩色控制台输出
  const badge = tag === 'E' ? _S_BG_ERR : _S_BG;
  console[method]('%c 极译·BG %c' + ts, badge, _S_TS, ...a);
}
function getBgLogs() { return _bgBuf.slice(); }
const LOG = (...a) => _bgLog('log', 'I', a);
const ERR = (...a) => _bgLog('error', 'E', a);

// 启动横幅
console.log(
  '%c 极译 %c Service Worker %c已启动',
  'background:#0d9488;color:#fff;padding:3px 8px;border-radius:4px 0 0 4px;font-weight:bold;font-size:12px',
  'background:#0f766e;color:#ccfbf1;padding:3px 8px;font-size:11px',
  'color:#6b7280;font-size:10px'
);

// ═══════════════════════════════════════════════════════════
// 安装
// ═══════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(async () => {
  setupContextMenu();
  chrome.storage.sync.get('autoTranslate', d => {
    if (d.autoTranslate === undefined) {
      chrome.storage.sync.set({ autoTranslate: true });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'toggle_translation',
      title: '极译此页',
      contexts: ['page']
    });
  });
}

// ═══════════════════════════════════════════════════════════
// 标签状态
// ═══════════════════════════════════════════════════════════

async function getTabState(tabId) {
  const key = `tab_${tabId}`;
  const r = await chrome.storage.session.get(key);
  return r[key] ?? false;
}

async function setTabState(tabId, v) {
  await chrome.storage.session.set({ [`tab_${tabId}`]: v });
}

async function updateContextMenu(tabId) {
  try {
    const translated = await getTabState(tabId);
    await chrome.contextMenus.update('toggle_translation', {
      title: translated ? '↩️ 恢复原文' : '极译此页'
    });
  } catch (e) {
    ERR('updateContextMenu error:', e?.message || String(e));
  }
}

// ═══════════════════════════════════════════════════════════
// 标签事件
// ═══════════════════════════════════════════════════════════

chrome.tabs.onActivated.addListener(info => {
  updateContextMenu(info.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    setTabState(tabId, false).then(() => updateContextMenu(tabId)).catch(e => ERR('tabs.onUpdated setTabState error:', e?.message));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab_${tabId}`).catch(() => { });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session') return;
  for (const key of Object.keys(changes)) {
    if (!key.startsWith('tab_')) continue;
    const tabId = parseInt(key.slice(4), 10);
    if (isNaN(tabId)) continue;
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.active) updateContextMenu(tabId);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 右键菜单
// ═══════════════════════════════════════════════════════════

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || info.menuItemId !== 'toggle_translation') return;

  const translated = await getTabState(tab.id);
  const newState = !translated;

  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      action: newState ? 'translate_page' : 'restore_page'
    });
    if (res?.success === true && (newState === false || (res?.count ?? 0) > 0)) {
      await setTabState(tab.id, newState);
    }
  } catch (e) {
    // "Receiving end does not exist" = content script not injected (chrome:// etc), expected
    if ((e?.message || String(e)).includes('Receiving end does not exist')) return;
    ERR('context menu toggle error:', e?.message || String(e));
  }

  await updateContextMenu(tab.id);
});

// ═══════════════════════════════════════════════════════════
// CF KV 域名同步 — 自适应心跳
// ═══════════════════════════════════════════════════════════

const KV_ALARM = 'kv_sync';
const KV_FAST_SEC = 30;        // 快速轮询 30 秒
const KV_SLEEP_SEC = 300;      // 休眠 5 分钟
const KV_STABLE_LIMIT = 30;    // 连续 30 次无变化后休眠

let _kvStableCount = 0;
let _kvSleeping = false;
let _kvSyncPromise = null;

async function syncDomainsFromKV() {
  if (_kvSyncPromise) return _kvSyncPromise;
  _kvSyncPromise = (async () => {
    try {
      const cfg = await chrome.storage.local.get(['cfApiToken', 'cfAccountId', 'cfNamespaceId']);
      if (!cfg.cfApiToken || !cfg.cfAccountId || !cfg.cfNamespaceId) return { changed: false, error: null };
      const cloudDomains = await kvGetDomains();
      if (!Array.isArray(cloudDomains)) return { changed: false, error: 'KV 响应格式错误' };
      const valid = cloudDomains.filter(d => typeof d === 'string' && d.includes('.')).sort();
      const r = await chrome.storage.local.get('excludedDomains');
      const local = Array.isArray(r.excludedDomains) ? r.excludedDomains.filter(d => typeof d === 'string' && d.includes('.')) : [];
      // 合并：保留本地独有（本设备新增尚未同步到 KV），加入云端独有（其他设备新增）
      const cloudSet = new Set(valid);
      const merged = [...valid];
      for (const d of local) {
        if (!cloudSet.has(d)) merged.push(d);
      }
      merged.sort();
      if (merged.length !== local.length || merged.some((d, i) => d !== local[i])) {
        await chrome.storage.local.set({ excludedDomains: merged });
        LOG('KV 同步: 域名列表已合并, 共 ' + merged.length + ' 个');
        return { changed: true, error: null };
      }
      return { changed: false, error: null };
    } catch (e) {
      ERR('KV 同步失败:', e?.message || String(e));
      return { changed: false, error: e?.message || String(e) };
    }
  })();
  try {
    return await _kvSyncPromise;
  } finally {
    _kvSyncPromise = null;
  }
}

async function setKvAlarm(periodSec) {
  if (!chrome.alarms) return;
  await chrome.alarms.clear(KV_ALARM);
  chrome.alarms.create(KV_ALARM, { periodInMinutes: periodSec / 60 });
}

async function onKvHeartbeat() {
  const result = await syncDomainsFromKV();

  if (_kvSleeping) {
    _kvSleeping = false;
    _kvStableCount = 0;
    LOG('KV 心跳: 休眠结束，恢复快速轮询 (' + KV_FAST_SEC + 's)');
    await setKvAlarm(KV_FAST_SEC);
    return;
  }

  _kvStableCount = result.changed ? 0 : _kvStableCount + 1;

  if (_kvStableCount >= KV_STABLE_LIMIT) {
    _kvSleeping = true;
    _kvStableCount = 0;
    LOG('KV 心跳: 连续' + KV_STABLE_LIMIT + '次无变化，休眠 ' + KV_SLEEP_SEC + 's');
    await setKvAlarm(KV_SLEEP_SEC);
  }
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === KV_ALARM) onKvHeartbeat().catch(e => ERR('KV 心跳异常:', e?.message));
  });
}

// 启动: 先同步一次，再开始快速轮询
(async () => {
  try {
    await syncDomainsFromKV();
    await setKvAlarm(KV_FAST_SEC);
  } catch (e) {
    ERR('KV 启动同步失败:', e?.message || String(e));
  }
})();

// ═══════════════════════════════════════════════════════════
// 保持 Service Worker 存活
// ═══════════════════════════════════════════════════════════

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'keepAlive') return;
  port.onDisconnect.addListener(() => { chrome.runtime.lastError; });
});

// ═══════════════════════════════════════════════════════════
// 消息路由
// ═══════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  function safeSend(data) {
    try { sendResponse(data); } catch (_) { }
    if (chrome.runtime.lastError) { /* checked */ }
  }

  // 状态同步
  if (req.type === 'update_state') {
    const tabId = sender.tab?.id;
    if (tabId) {
      setTabState(tabId, req.translated)
        .then(() => safeSend({ ok: true }))
        .catch(() => safeSend({ ok: false }));
    } else {
      safeSend({ ok: false });
    }
    return true;
  }

  // 翻译请求
  if (req.type === 'translate') {
    const tabId = sender.tab?.id;
    LOG('收到翻译请求, sl=', req.sl, 'text长度=', (req.text || '').length);

    google(req.text || '', req.sl || 'auto', req.domain, tabId, req.groupId)
      .then(r => {
        LOG('翻译成功, 引擎=', r.engine, '结果长度=', (r.translation || '').length);
        safeSend(r);
      })
      .catch(e => {
        ERR('翻译失败:', e?.message || String(e));
        safeSend({ error: e?.message || String(e) });
      });

    return true;
  }

  // 引擎延迟测试
  if (req.type === 'ping_engines') {
    pingBoth()
      .then(results => safeSend({ results }))
      .catch(e => safeSend({ error: e.message }));
    return true;
  }

  // 腾讯云配置更新
  if (req.type === 'tencent_config_updated') {
    safeSend({ ok: true });
    return false;
  }

  // KV 配置更新 → 重置心跳，立即同步
  if (req.type === 'kv_config_updated') {
    _kvStableCount = 0;
    if (_kvSleeping) {
      _kvSleeping = false;
      setKvAlarm(KV_FAST_SEC);
    }
    syncDomainsFromKV().catch(e => ERR('kv_config_updated sync failed:', e?.message));
    safeSend({ ok: true });
    return false;
  }

  // 引擎选择变更
  if (req.type === 'engine_selected') {
    LOG('引擎切换:', req.engine);
    safeSend({ ok: true });
    return false;
  }

  // 导出日志 (合并 background + api + kv 缓冲)
  if (req.type === 'get_logs') {
    safeSend({ bg: getBgLogs(), api: getApiLogs(), kv: getKvLogs() });
    return false;
  }

  // KV 连通性测试
  if (req.type === 'ping_kv') {
    kvGetDomains()
      .then(() => safeSend({ ok: true }))
      .catch(e => safeSend({ ok: false, error: e.message }));
    return true;
  }

  // KV 域名同步
  if (req.type === 'kv_sync') {
    syncDomainsFromKV()
      .then((result) => safeSend({ ok: true, changed: result.changed, error: result.error }))
      .catch(e => safeSend({ ok: false, error: e.message }));
    return true;
  }

  if (req.type === 'kv_put_domains') {
    kvPutDomains(req.domains)
      .then(async () => {
        // PUT 成功 → 重置心跳计数，确保下次拉取立即可见
        _kvStableCount = 0;
        if (_kvSleeping) {
          _kvSleeping = false;
          await setKvAlarm(KV_FAST_SEC);
        }
        safeSend({ ok: true });
      })
      .catch(e => safeSend({ ok: false, error: e.message }));
    return true;
  }

});
