// XPathsに従って、要素が出現するまで待ってから入力＆クリック
(function() {
  // 二重注入ガード（再実行されてもリスナーが重複しないように）
  if (window.__PLAMO_CONTENT_READY__) return;
  window.__PLAMO_CONTENT_READY__ = true;
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rects = el.getClientRects();
    const style = getComputedStyle(el);
    // opacity 0 のケースでも入力だけは許可したいので、判定を緩める
    return rects && rects.length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }
  function getByXPath(xpath, root=document) {
    return document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }
  function waitForXPath(xpath, { timeout=30000, poll=200 } = {}) {
    const existing = getByXPath(xpath);
    if (existing && isVisible(existing)) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      const observer = new MutationObserver(() => {
        const el = getByXPath(xpath);
        if (el && isVisible(el)) { cleanup(); resolve(el); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const iv = setInterval(() => {
        const el = getByXPath(xpath);
        if (el && isVisible(el)) { cleanup(); resolve(el); }
        else if (Date.now() > deadline) { cleanup(); reject(new Error('XPath not found within timeout: ' + xpath)); }
      }, poll);
      function cleanup() {
        try { observer.disconnect(); } catch {}
        try { clearInterval(iv); } catch {}
      }
    });
  }
  function waitForSelector(selector, { timeout=30000, poll=200 } = {}) {
    const existing = document.querySelector(selector);
    if (existing && isVisible(existing)) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el && isVisible(el)) { cleanup(); resolve(el); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const iv = setInterval(() => {
        const el = document.querySelector(selector);
        if (el && isVisible(el)) { cleanup(); resolve(el); }
        else if (Date.now() > deadline) { cleanup(); reject(new Error('Selector not found within timeout: ' + selector)); }
      }, poll);
      function cleanup() {
        try { observer.disconnect(); } catch {}
        try { clearInterval(iv); } catch {}
      }
    });
  }
  
  async function waitForTextarea() {
    // 0) 最短経路: ID が存在するなら可視性に関係なく返す
    const fast = document.querySelector('#source-textarea');
    if (fast) return fast;
    // 1) id で直接（可視性あり）
    const byId = document.getElementById('source-textarea');
    if (byId && isVisible(byId)) return byId;
    try {
      const el = await waitForSelector('#source-textarea, textarea#source-textarea');
      if (el) return el;
    } catch {}
    // 2) placeholder で
    try {
      const ph = await waitForSelector('textarea[placeholder="原文を入力してください"]');
      if (ph) return ph;
    } catch {}
    // 3) 親コンテナ内の textarea
    try {
      const container = await waitForXPath('/html/body/div[1]/div/div[2]/div[1]/div');
      const inContainer = container.querySelector('textarea');
      if (inContainer && isVisible(inContainer)) return inContainer;
    } catch {}
    // 4) 既存のXPath
    const byXp = await waitForXPath('/html/body/div[1]/div/div[2]/div[1]/div/textarea');
    if (byXp) return byXp;
    // 5) 最後のフォールバック: 可視性不問で ID をもう一度
    const any = document.querySelector('#source-textarea');
    if (any) return any;
    throw new Error('textarea not found');
  }

  function setTextAreaValue(textarea, value) {
    const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    const setter = desc && desc.set;
    if (setter) setter.call(textarea, value); else textarea.value = value;
    // beforeinput -> input で貼り付けに近い挙動を再現
    try {
      textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertFromPaste', data: value }));
    } catch {}
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertFromPaste', data: value }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function dispatchKey(target, type, opts) {
    const event = new KeyboardEvent(type, opts);
    Object.defineProperty(event, 'keyCode', { get: () => (opts.keyCode ?? 13) });
    Object.defineProperty(event, 'which', { get: () => (opts.which ?? 13) });
    return target.dispatchEvent(event);
  }

  async function sendCtrlOrCmdEnter(target) {
    const base = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 13, bubbles: true, cancelable: true, composed: true };
    const combos = [ { ctrlKey: true }, { metaKey: true } ];
    for (const combo of combos) {
      const opts = Object.assign({}, base, combo);
      const targets = [target, document.activeElement || target, document];
      for (const t of targets) {
        dispatchKey(t, 'keydown', opts);
        await sleep(12);
        dispatchKey(t, 'keypress', opts);
        await sleep(12);
        dispatchKey(t, 'keyup', opts);
      }
      await sleep(150);
    }
  }

  function findNearbyButton(textarea) {
    const keywords = ['翻訳','送信','translate','submit','send','実行','開始','go','search'];
    const lower = (s) => (s || '').toLowerCase();
    const isEnabled = (el) => el && !el.disabled && getComputedStyle(el).pointerEvents !== 'none';

    const checkList = (root) => {
      const list = Array.from(root.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'));
      const byText = list.find(el => isVisible(el) && isEnabled(el) && keywords.some(k => lower(el.textContent).includes(lower(k)) || lower(el.value).includes(lower(k))));
      if (byText) return byText;
      return list.find(el => isVisible(el) && isEnabled(el));
    };

    // 1) 近傍のコンテナから上に向かって探索
    let cur = textarea;
    for (let depth = 0; cur && depth < 6; depth += 1) {
      const btn = checkList(cur);
      if (btn) return btn;
      cur = cur.parentElement;
    }
    // 2) 全体から探索
    return checkList(document);
  }
  
  function fastFindTextarea() {
    return (
      document.getElementById('source-textarea') ||
      document.querySelector('#source-textarea, textarea#source-textarea, textarea[placeholder="原文を入力してください"]') ||
      getByXPath('/html/body/div[1]/div/div[2]/div[1]/div/textarea')
    );
  }

  const SUBMIT_XPATH = '/html/body/div[1]/div/div[2]/div[4]/button';
  function fastFindSubmit(textarea) {
    return (
      getByXPath(SUBMIT_XPATH) ||
      (textarea ? findNearbyButton(textarea) : null) ||
      findNearbyButton(document.body || document)
    );
  }

  function scheduleClickWhenReady(text, textarea) {
    let done = false;
    const start = Date.now();
    const deadline = start + 15000; // 最長 15s 監視（非ブロッキング）

    const tick = async () => {
      if (done) return;
      const ta = textarea?.isConnected ? textarea : fastFindTextarea();
      if (ta) {
        // 最終的に確実な値で上書き
        setTextAreaValue(ta, text);
        const btn = fastFindSubmit(ta);
        if (btn && typeof btn.click === 'function') {
          try { btn.click(); done = true; return; } catch {}
        }
      }
      // クリックできない場合、一定時間経過後に Ctrl/Cmd+Enter を試す
      if (ta && Date.now() - start > 1200) {
        try { await sendCtrlOrCmdEnter(ta); done = true; return; } catch {}
      }
      if (Date.now() < deadline) {
        setTimeout(tick, 180);
      }
    };
    setTimeout(tick, 160);
    return () => { done = true; };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || (msg.type !== 'fillAndClick' && msg.type !== 'fillOnly')) return;
    (async () => {
      try {
        const text = msg.text || '';
        let textarea = fastFindTextarea();
        if (textarea) {
          textarea.scrollIntoView({ block: 'center', inline: 'nearest' });
          textarea.focus();
          setTextAreaValue(textarea, text);
        }

        const doSubmit = msg.type === 'fillAndClick' && (msg.submit !== false);
        if (doSubmit) {
          // できるだけ早く応答を返しつつ、バックグラウンドでクリックまで進める
          scheduleClickWhenReady(text, textarea);
        }

        // 即応答で 1 秒以上待たせない
        sendResponse({ ok: true, early: true });
      } catch (e) {
        console.warn('[PlamoExt]', e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async
  });
})();
