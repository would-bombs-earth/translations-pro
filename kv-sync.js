// kv-sync.js
// Cloudflare KV — 域名列表跨设备同步
// 由 background.js (ES Module) import

const KV_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

// ── 控制台样式 ──
const _S_KV     = 'background:#d97706;color:#fff;padding:1px 7px;border-radius:3px;font-weight:600';
const _S_KV_ERR = 'background:#ef4444;color:#fff;padding:1px 7px;border-radius:3px;font-weight:600';
const _S_TS     = 'color:#6b7280;font-weight:normal';

const _kvBuf = [];
const _kvBufMax = 200;

function _kvLog(method, tag, a) {
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `[${ts}][${tag}][KV]`;
    const line = prefix + ' ' + a.map(x => {
        if (x === null || x === undefined) return String(x);
        if (typeof x === 'object') { try { return JSON.stringify(x); } catch (_) { return String(x); } }
        return String(x);
    }).join(' ');
    _kvBuf.push(line);
    if (_kvBuf.length > _kvBufMax) _kvBuf.shift();
    // 彩色控制台输出
    const badge = tag === 'E' ? _S_KV_ERR : _S_KV;
    console[method]('%c 极译·KV %c' + ts, badge, _S_TS, ...a);
}

export function getKvLogs() { return _kvBuf.slice(); }

const LOG = (...a) => _kvLog('log', 'I', a);
const ERR = (...a) => _kvLog('error', 'E', a);

// ═══════════════════════════════════════════════════════════
// KV 配置
// ═══════════════════════════════════════════════════════════

const KV_KEY = 'domains';

async function getKvConfig() {
    const data = await chrome.storage.local.get(['cfApiToken', 'cfAccountId', 'cfNamespaceId']);
    return {
        token: (data.cfApiToken || '').trim(),
        accountId: (data.cfAccountId || '').trim(),
        namespaceId: (data.cfNamespaceId || '').trim()
    };
}

// ═══════════════════════════════════════════════════════════
// KV REST API
// ═══════════════════════════════════════════════════════════

export async function kvGetDomains() {
    const config = await getKvConfig();
    if (!config.token || !config.accountId || !config.namespaceId) {
        throw new Error('CF KV 未配置');
    }
    const url = `${KV_API_BASE}/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${KV_KEY}`;
    LOG('GET ' + url.replace(config.token, '***'));
    const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + config.token }
    });
    if (res.status === 404) {
        LOG('GET 404: key 不存在，返回空列表');
        return [];
    }
    const text = await res.text();
    LOG('GET 响应: ' + res.status + ' len=' + text.length);
    if (!res.ok) {
        ERR('GET 错误: ' + res.status + ' ' + text.slice(0, 500));
        throw new Error('KV GET HTTP ' + res.status);
    }
    try { return JSON.parse(text); } catch (_) { return []; }
}

export async function kvPutDomains(domains) {
    const config = await getKvConfig();
    if (!config.token || !config.accountId || !config.namespaceId) {
        throw new Error('CF KV 未配置');
    }
    const url = `${KV_API_BASE}/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${KV_KEY}`;
    const body = JSON.stringify(domains);
    LOG('PUT ' + url.replace(config.token, '***') + ' (' + domains.length + ' domains)');
    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + config.token,
            'Content-Type': 'application/json'
        },
        body: body
    });
    const resText = await res.text();
    LOG('PUT 响应: ' + res.status + ' ' + resText.slice(0, 200));
    if (!res.ok) throw new Error('KV PUT HTTP ' + res.status + ': ' + resText.slice(0, 80));
}
