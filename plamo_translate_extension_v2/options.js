const DEFAULT_SETTINGS = { autoSubmit: true, enableDoubleCopy: false };

function getSettings() {
  return new Promise((resolve) => {
    try { chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => resolve(items || DEFAULT_SETTINGS)); }
    catch { resolve(DEFAULT_SETTINGS); }
  });
}

function saveSettings(data) {
  return new Promise((resolve) => {
    try { chrome.storage.sync.set(data, () => resolve()); }
    catch { resolve(); }
  });
}

function hasAllUrlsPermission() {
  return new Promise((resolve) => {
    try { chrome.permissions.contains({ origins: ['http://*/*','https://*/*'] }, (ok) => resolve(!!ok)); }
    catch { resolve(false); }
  });
}

function requestAllUrlsPermission() {
  return new Promise((resolve) => {
    try { chrome.permissions.request({ origins: ['http://*/*','https://*/*'] }, (granted) => resolve(!!granted)); }
    catch { resolve(false); }
  });
}

function removeAllUrlsPermission() {
  return new Promise((resolve) => {
    try { chrome.permissions.remove({ origins: ['http://*/*','https://*/*'] }, (removed) => resolve(!!removed)); }
    catch { resolve(false); }
  });
}

(async function init() {
  const { autoSubmit, enableDoubleCopy } = await getSettings();
  document.getElementById('autoSubmit').checked = !!autoSubmit;
  const dcEl = document.getElementById('enableDoubleCopy');
  if (dcEl) dcEl.checked = !!enableDoubleCopy;

  document.getElementById('save').addEventListener('click', async () => {
    const wantDoubleCopy = !!(dcEl && dcEl.checked);
    let granted = await hasAllUrlsPermission();
    if (wantDoubleCopy && !granted) {
      granted = await requestAllUrlsPermission();
      if (granted) {
        try { await new Promise(r => chrome.runtime.sendMessage({ type: 'DOUBLECOPY_ENABLE' }, () => r())); } catch {}
      }
    }
    if (!wantDoubleCopy && granted) {
      try { await new Promise(r => chrome.runtime.sendMessage({ type: 'DOUBLECOPY_DISABLE' }, () => r())); } catch {}
      await removeAllUrlsPermission();
      granted = false;
    }

    const next = { autoSubmit: !!document.getElementById('autoSubmit').checked, enableDoubleCopy: !!(wantDoubleCopy && granted) };
    await saveSettings(next);
    if (dcEl && wantDoubleCopy && !granted) dcEl.checked = false; // reflect rejection

    const status = document.getElementById('status');
    status.textContent = '保存しました' + (wantDoubleCopy && !granted ? '（ダブルコピーは権限未許可のため無効）' : '');
    setTimeout(() => (status.textContent = ''), 1800);
  });
})();
