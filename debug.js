// debug.js — Translation Debug Logger
// 在控制台输出翻译批次摘要及译文
// 通过 window.__gt_debug 注册回调，由 content.js 的钩子触发

(function () {

  const TAG = '极译·调试';
  const S_HEAD = 'background:#6366f1;color:#fff;padding:2px 8px;border-radius:3px;font-weight:bold';
  const S_NONE = '';
  const S_GRAY = 'color:#9ca3af';
  const S_MS = 'background:#2563eb;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600';
  const S_CACHE = 'background:#374151;color:#9ca3af;padding:1px 6px;border-radius:3px';

  let detectCount = 0;

  window.__gt_debug = {

    detect() { detectCount++; },

    batch_send(data) {
      console.groupCollapsed(
        `%c${TAG}%c 批次 #${data.seq} %c— %c${data.count} 条原文 %c(已扫描 ${detectCount} 项)`,
        S_HEAD, S_NONE, S_GRAY, 'color:#e2e8f0;font-weight:600', S_GRAY
      );
      if (data.items) {
        data.items.forEach(function (item, i) {
          console.log(`%c[${item.id}]%c ${item.raw}`, S_GRAY, S_NONE);
        });
        console.log('%c' + '─'.repeat(40), S_GRAY);
        console.log('%c\u2191 \u5F85\u7FFB\u8BD1 %c%d \u6761', S_GRAY, 'color:#fbbf24', data.items.length);
      }
      console.groupEnd();
    },

    batch_done(data) {
      const ms = data.elapsed.toFixed(0);
      const engName = data.engine || '?';
      let engLabel, engStyle;
      if (engName === 'microsoft') {
        engLabel = 'MS';
        engStyle = S_MS;
      } else if (engName === 'google') {
        engLabel = 'Google';
        engStyle = 'background:#2dd4a8;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600';
      } else if (engName === '(cache)') {
        engLabel = '缓存';
        engStyle = S_CACHE;
      } else {
        engLabel = '?';
        engStyle = 'background:#4b5563;color:#d1d5db;padding:1px 6px;border-radius:3px';
      }
      console.log(
        `%c${TAG}%c 批次 #${data.seq} %c\u2714 %c${data.count} \u6761 %c${ms}ms %c${engLabel}`,
        S_HEAD, S_NONE,
        'color:#2dd4a8;font-weight:bold', 'color:#e2e8f0',
        'color:#6b7280;font-size:11px',
        engStyle
      );
      // 显示实际翻译结果
      if (data.pairs && data.pairs.length) {
        console.groupCollapsed('%c译文详情 %c' + data.pairs.length + ' 条', S_GRAY, 'color:#e2e8f0');
        data.pairs.forEach(function (p, i) {
          console.log('%c原文%c ' + p.raw, 'color:#f87171', 'color:#e2e8f0');
          console.log('%c译文%c ' + (p.translated || '(空)'), 'color:#2dd4a8', 'color:#e2e8f0');
        });
        console.groupEnd();
      }
    }
  };

  console.log(
    `%c${TAG}%c 调试模式 %c已启用 %c— 翻译批次将在此面板输出`,
    S_HEAD, S_NONE, 'color:#2dd4a8', 'color:#9ca3af'
  );

})();
