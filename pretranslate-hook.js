// pretranslate-hook.js — 注入页面上下文，拦截 Twitter API 响应，提取文本供预翻译
// 运行在页面 JS 世界（非 content script 隔离世界），可拦截页面的 fetch / XHR

(function () {
  'use strict';

  var MIN_TEXT_LEN = 12; // 短于此长度的字符串不提取（过滤 ID、用户名等）
  var TEXT_RE = /[a-zA-Z一-鿿぀-ゟ゠-ヿ가-힯Ѐ-ӿ]/;

  function isTwitterApiUrl(url) {
    if (!url) return false;
    return /twitter\.com\/i\/api\//i.test(url) || /x\.com\/i\/api\//i.test(url);
  }

  function extractTexts(obj, minLen) {
    minLen = minLen || MIN_TEXT_LEN;
    var texts = [];
    var seen = new Set();

    function walk(o, depth) {
      if (!o || typeof o !== 'object') return;
      if (depth > 15) return; // 防止过深递归
      if (Array.isArray(o)) {
        for (var i = 0; i < o.length; i++) walk(o[i], depth + 1);
        return;
      }
      var keys = Object.keys(o);
      for (var k = 0; k < keys.length; k++) {
        var val = o[keys[k]];
        if (typeof val === 'string') {
          var s = val.trim();
          if (s.length >= minLen &&
              !/^https?:\/\//i.test(s) &&
              !/^\d{4,}$/.test(s) &&           // 纯数字 ID
              TEXT_RE.test(s) &&                // 至少含一个有意义字符
              !seen.has(s)) {
            seen.add(s);
            texts.push(s);
          }
        } else if (typeof val === 'object' && val !== null) {
          walk(val, depth + 1);
        }
      }
    }

    walk(obj, 0);
    return texts;
  }

  function postTexts(texts, url) {
    if (!texts || !texts.length) return;
    window.postMessage({
      source: 'jiyi-pretranslate',
      type: 'PRETRANSLATE_TEXTS',
      texts: texts,
      url: url
    }, '*');
  }

  // ── Hook fetch ──
  var _origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = '';
    if (typeof input === 'string') url = input;
    else if (input && typeof input.url === 'string') url = input.url;

    var promise = _origFetch.call(this, input, init);

    if (isTwitterApiUrl(url)) {
      promise.then(function (response) {
        if (!response || !response.ok) return;
        try {
          var cloned = response.clone();
          cloned.json().then(function (json) {
            postTexts(extractTexts(json), url);
          }).catch(function () {});
        } catch (_) {}
      }).catch(function () {});
    }

    return promise;
  };

  // ── Hook XMLHttpRequest ──
  var OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var xhr = new OrigXHR();
    var _url = '';

    var origOpen = xhr.open;
    xhr.open = function (method, url) {
      _url = typeof url === 'string' ? url : '';
      return origOpen.apply(this, arguments);
    };

    xhr.addEventListener('load', function () {
      if (!isTwitterApiUrl(_url)) return;
      if (xhr.status < 200 || xhr.status >= 300) return;
      try {
        var json = JSON.parse(xhr.responseText);
        postTexts(extractTexts(json), _url);
      } catch (_) {}
    });

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;
  // Copy static constants (UNSENT=0, OPENED=1, HEADERS_RECEIVED=2, LOADING=3, DONE=4)
  Object.keys(OrigXHR).forEach(function (k) {
    try { window.XMLHttpRequest[k] = OrigXHR[k]; } catch (_) {}
  });
  window.XMLHttpRequest.UNSENT = 0;
  window.XMLHttpRequest.OPENED = 1;
  window.XMLHttpRequest.HEADERS_RECEIVED = 2;
  window.XMLHttpRequest.LOADING = 3;
  window.XMLHttpRequest.DONE = 4;
})();
