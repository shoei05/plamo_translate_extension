const DEFAULT_SETTINGS = { autoSubmit: true };

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

(async function init() {
  const { autoSubmit } = await getSettings();
  document.getElementById('autoSubmit').checked = !!autoSubmit;

  document.getElementById('save').addEventListener('click', async () => {
    const next = { autoSubmit: !!document.getElementById('autoSubmit').checked };
    await saveSettings(next);
    const status = document.getElementById('status');
    status.textContent = '保存しました';
    setTimeout(() => (status.textContent = ''), 1400);
  });
})();

