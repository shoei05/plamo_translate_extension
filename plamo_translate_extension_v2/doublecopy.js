// Detect double-copy (Ctrl/Cmd+C twice quickly) and send selection to background
(() => {
  try { if (window.__PLAMO_DOUBLECOPY_READY__) return; window.__PLAMO_DOUBLECOPY_READY__ = true; } catch (_) {}

  const THRESHOLD_MS = 400; // within this interval counts as double-copy
  const COOLDOWN_MS = 1000; // throttle send to avoid rapid repeats
  let lastCopyAt = 0;
  let lastText = '';
  let lastSentAt = 0;

  function getSelectedText() {
    try {
      const sel = window.getSelection && window.getSelection();
      const t = sel && typeof sel.toString === 'function' ? sel.toString() : '';
      if (t && t.trim()) return t;
    } catch (_) {}
    try {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        const start = ae.selectionStart, end = ae.selectionEnd;
        if (typeof start === 'number' && typeof end === 'number' && end > start) {
          return String(ae.value || '').slice(start, end);
        }
      }
    } catch (_) {}
    return '';
  }

  function safeSend(text) {
    try { chrome.runtime?.sendMessage?.({ type: 'PLAMO_SEND', text }, () => void chrome.runtime.lastError); } catch (_) {}
  }

  document.addEventListener('copy', () => {
    const now = Date.now();
    const text = (getSelectedText() || '').trim();
    if (!text) { lastCopyAt = now; lastText = ''; return; }

    const isDouble = (now - lastCopyAt) <= THRESHOLD_MS && text === lastText;
    if (isDouble) {
      if (now - lastSentAt >= COOLDOWN_MS) {
        lastSentAt = now;
        safeSend(text);
      }
    }
    lastCopyAt = now;
    lastText = text;
  }, { capture: true });
})();

