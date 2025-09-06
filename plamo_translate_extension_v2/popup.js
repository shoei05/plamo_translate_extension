(() => {
  try { console.info('[PlamoExt][popup] loaded'); } catch (_) {}
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const submitButton = form?.querySelector('button[type="submit"]');
  let submitted = false;

  // 既定でフォーカスして、すぐに入力/ショートカットを受け付ける
  try { input?.focus(); } catch (_) {}

  // アイコンは manifest の static PNG を使用

  // 入力動作: 通常のEnterは送信しない。Ctrl/Cmd+Enterのみ送信。
  let composing = false;
  input.addEventListener('compositionstart', () => (composing = true));
  input.addEventListener('compositionend', () => (composing = false));
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (e.isComposing || composing) return; // 変換確定中は送らない
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // フォールバック: フォーカスがボタン等にある場合でも Cmd/Ctrl+Enter で送信
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13)) {
      // 入力欄自身がターゲットのときは二重発火を避けて何もしない
      if (e.target === input) return;
      if (e.isComposing || composing) return;
      e.preventDefault();
      form.requestSubmit();
    }
  }, { capture: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitted) return;
    const text = (input.value || '').trim();
    if (!text) return; // ポップアップでは空送信はしない（READMEの仕様に合わせる）
    submitted = true;
    try { submitButton && (submitButton.disabled = true); } catch (_) {}
    // 可能ならクリップボードへ事前コピー（ユーザー操作由来のため許可されやすい）
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    // 統一: 背景に依頼してタブ作成/再利用 + 注入を任せる
    chrome.runtime.sendMessage({ type: 'PLAMO_SEND', text }, () => void chrome.runtime.lastError);
    window.close();
  });

  // Open Options link from popup
  const openOptions = document.getElementById('openOptions');
  if (openOptions) {
    openOptions.addEventListener('click', (e) => {
      e.preventDefault();
      try { chrome.runtime.openOptionsPage(); } catch (_) {}
    });
  }
})();
