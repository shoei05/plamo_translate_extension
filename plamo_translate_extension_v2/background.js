// MV3 service worker for omnibox: "pl <text>"
const TARGET = 'https://translate-demo.plamo.preferredai.jp/';

// ===== Settings =====
const DEFAULT_SETTINGS = { autoSubmit: true };
function getSettings() {
  return new Promise((resolve) => {
    try { chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items || DEFAULT_SETTINGS)); }
    catch { resolve(DEFAULT_SETTINGS); }
  });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Omnibox suggestions while typing (safer on empty input)
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const preview = (text && text.length > 0) ? text : 'テキストを入力';
  try {
    chrome.omnibox.setDefaultSuggestion({ description: `Plamo で翻訳: <match>${preview}</match>` });
  } catch (_) { /* ignore */ }
  try {
    suggest?.([
      { content: text && text.length > 0 ? text : preview, description: `Plamo で翻訳: <match>${preview}</match>` }
    ]);
  } catch (_) { /* ignore */ }
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  try {
    // Respect disposition: currentTab/newForegroundTab/newBackgroundTab
    await handleTranslate((text || '').trim(), disposition);
  } catch (e) { console.warn('[PlamoExt][omnibox]', e); }
});

async function sendWithRetry(tabId, text, type = 'fillAndClick', timeoutMs = 30000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type, text }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) { reject(err); return; }
          resolve(response);
        });
      });
      if (res && res.ok) return true;
    } catch (_) {
      // content script not ready yet
    }
    attempt += 1;
    // より短い間隔で再試行（体感の遅延を削減）
    await wait(Math.min(120 + attempt * 120, 480));
  }
  return false;
}

// Fallback: directly inject code to fill the textarea via scripting API
async function fillViaScripting(tabId, text, autoSubmit = true) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      args: [text, !!autoSubmit],
      func: async (value, doSubmit) => {
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
        function getByXPath(xpath, root=document) {
          return document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        }
        function isVisible(el) {
          if (!el || !el.isConnected) return false;
          const rects = el.getClientRects();
          const style = getComputedStyle(el);
          return rects && rects.length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        }
        async function waitForTextarea({ timeout=15000, poll=120 } = {}) {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            // 可視性を問わず id があれば最短で返す（早期プレフィル向け）
            let el = document.getElementById('source-textarea');
            if (el) return el;
            el = document.querySelector('#source-textarea, textarea#source-textarea, textarea[placeholder="原文を入力してください"]');
            if (el) return el;
            el = getByXPath('/html/body/div[1]/div/div[2]/div[1]/div/textarea');
            if (el && isVisible(el)) return el;
            await sleep(poll);
          }
          throw new Error('textarea not found');
        }
        const SUBMIT_XPATH = '/html/body/div[1]/div/div[2]/div[4]/button';
        async function waitForSubmitButton({ timeout=8000, poll=120 } = {}) {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const el = getByXPath(SUBMIT_XPATH);
            if (el && isVisible(el)) return el;
            await sleep(poll);
          }
          return null;
        }
        function setTextAreaValue(textarea, v) {
          const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
          const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
          const setter = desc && desc.set;
          if (setter) setter.call(textarea, v); else textarea.value = v;
          try { textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertFromPaste', data: v })); } catch {}
          textarea.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertFromPaste', data: v }));
          textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
        function dispatchKey(target, type, opts) {
          const event = new KeyboardEvent(type, opts);
          try { Object.defineProperty(event, 'keyCode', { get: () => (opts.keyCode ?? 13) }); } catch {}
          try { Object.defineProperty(event, 'which', { get: () => (opts.which ?? 13) }); } catch {}
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
              await sleep(8);
              dispatchKey(t, 'keypress', opts);
              await sleep(8);
              dispatchKey(t, 'keyup', opts);
            }
            await sleep(80);
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
          let cur = textarea;
          for (let depth = 0; cur && depth < 6; depth += 1) {
            const btn = checkList(cur);
            if (btn) return btn;
            cur = cur.parentElement;
          }
          return checkList(document);
        }
        const ta = await waitForTextarea();
        ta.focus();
        if (doSubmit) {
          try {
            // 先に送信ボタンを待つ → 値を設定 → 即クリック
            let btn = await waitForSubmitButton({ timeout: 5000, poll: 120 });
            if (!btn) btn = findNearbyButton(ta);
            setTextAreaValue(ta, value || '');
            await sleep(50);
            if (btn && typeof btn.click === 'function') {
              btn.click();
            } else {
              await sendCtrlOrCmdEnter(ta);
            }
          } catch (_) {}
        } else {
          // 入力のみ
          setTextAreaValue(ta, value || '');
        }
        return true;
      }
    });
    // Succeeds if any frame returned true
    return Array.isArray(result) && result.some(r => r && r.result === true);
  } catch (e) {
    console.warn('[PlamoExt][bg] direct injection failed', e);
    return false;
  }
}

// fastFillLoop は早期貼り付けによる競合を避けるため未使用（保持のみ）
async function fastFillLoop(tabId, text, autoSubmit = true, totalMs = 6000) {
  return fillViaScripting(tabId, text, autoSubmit);
}

// 体感改善のための軽量プレフィル（送信はしない）
async function prefillQuick(tabId, text, totalMs = 1500) {
  const start = Date.now();
  let delay = 100;
  while (Date.now() - start < totalMs) {
    try {
      const ok = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        args: [text],
        func: (value) => {
          function setTextAreaValue(textarea, v) {
            const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
            const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
            const setter = desc && desc.set;
            if (setter) setter.call(textarea, v); else textarea.value = v;
            try { textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertFromPaste', data: v })); } catch {}
            textarea.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertFromPaste', data: v }));
          }
          const ta = document.getElementById('source-textarea') || document.querySelector('#source-textarea, textarea#source-textarea');
          if (ta) { setTextAreaValue(ta, value || ''); return true; }
          return false;
        }
      });
      if (Array.isArray(ok) && ok.some(r => r && r.result === true)) return true;
    } catch (_) { /* ignore transient errors */ }
    await wait(delay);
    delay = Math.min(delay + 50, 250);
  }
  return false;
}

// Unified handler for translate action (omnibox, context menu, etc.)
async function handleTranslate(query, disposition) {
  const q = (query || '').trim();
  const { autoSubmit } = await getSettings();
  const shouldSubmit = !!(autoSubmit && q.length > 0);
  // Reuse existing Plamo tab if present, otherwise open
  const tabs = await chrome.tabs.query({ url: TARGET + '*' });
  let tab;
  if (tabs && tabs.length) {
    tab = tabs[0];
    const updateProps = (disposition === 'currentTab') ? { active: true } : { active: true };
    await chrome.tabs.update(tab.id, updateProps);
  } else {
    // Create based on disposition
    const createProps = { url: TARGET, active: disposition !== 'newBackgroundTab' };
    tab = await chrome.tabs.create(createProps);
  }

  // 空入力ならページを開くだけ（自動送信はしない）
  if (!q) return;

  // 先に content script 経由で安定送信（要素の出現を待ってから貼り付け）
  // 体感を速くするため、軽量プレフィルを並行実行
  try { prefillQuick(tab.id, q).catch(() => {}); } catch (_) {}
  let ok = await sendWithRetry(tab.id, q, shouldSubmit ? 'fillAndClick' : 'fillOnly', 35000);
  if (!ok) {
    // フォールバック: 直接スクリプト注入（ボタン待機→貼り付け→即クリック）
    ok = await fillViaScripting(tab.id, q, shouldSubmit);
  }
  if (!ok) {
    // 最終フォールバック（理論上ここには来ない想定）
    ok = await fastFillLoop(tab.id, q, shouldSubmit, 6000);
  }
  if (!ok) throw new Error('Failed to send/fill on the page');
}

// アイコンは manifest の static PNG を使用（動的生成は行わない）

// Note: Rely on manifest's static default_popup.
// Avoid dynamic setPopup to prevent rare race conditions where the action
// temporarily has no popup and clicks appear to do nothing.

// すでに開いている対象ドメインのタブに content script を事前注入
async function warmExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: TARGET + '*' });
    await Promise.all((tabs || []).map(t =>
      chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['content.js'] })
        .catch(() => {})
    ));
  } catch (_) { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(async () => {
  warmExistingTabs();
  // Set up context menu for selection -> translate
  try { await chrome.contextMenus.removeAll(); } catch (_) {}
  try {
    chrome.contextMenus.create({
      id: 'plamo-translate',
      title: 'Plamoで翻訳: "%s"',
      contexts: ['selection']
    });
  } catch (e) { /* ignore */ }
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => { warmExistingTabs(); });
}

// Best effort: nothing to do here for icons (static)

// Fallback: if for any reason the action has no popup,
// ensure a click still does something visible.
// (Chrome suppresses onClicked when a popup is defined, so this won't double-fire.)
try {
  chrome.action.onClicked.addListener(async () => {
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 380,
        height: 260,
        focused: true,
      });
    } catch (e) {
      console.warn('[PlamoExt] openPopup fallback failed', e);
    }
  });
} catch (_) { /* ignore environments lacking onClicked */ }

// Context menu click handler
chrome.contextMenus?.onClicked?.addListener((info) => {
  if (info.menuItemId === 'plamo-translate' && info.selectionText) {
    handleTranslate(info.selectionText).catch((e) => console.warn('[PlamoExt][cm]', e));
  }
});

// Optional: message-based trigger from UI
chrome.runtime.onMessage.addListener((msg, _sender, _resp) => {
  if (msg?.type === 'PLAMO_SEND' && typeof msg.text === 'string') {
    warmExistingTabs().finally(() =>
      handleTranslate(msg.text).catch((e) => console.warn('[PlamoExt][msg]', e))
    );
  }
});
