const STORAGE_KEY = 'tomos_data';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('daily-export', { periodInMinutes: 1440 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-export') {
    exportData();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'tomos-get-data') {
    chrome.storage.local.get(STORAGE_KEY).then(result => {
      sendResponse(result[STORAGE_KEY] || {});
    }).catch(() => {
      sendResponse({});
    });
    return true;
  }

  if (message.type === 'tomos-clear-data') {
    chrome.storage.local.remove(STORAGE_KEY).then(() => {
      sendResponse({ success: true });
    }).catch(() => {
      sendResponse({ success: false });
    });
    return true;
  }

  if (message.type === 'tomos-export-data') {
    exportData();
    sendResponse({ success: true });
    return true;
  }
});

async function exportData() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY];
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const tab = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab[0]) {
      await chrome.scripting.executeScript({
        target: { tabId: tab[0].id },
        func: (dataUrl) => {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `tomos-export-${new Date().toISOString().split('T')[0]}.json`;
          a.click();
        },
        args: [url]
      }).catch(() => {});
    }

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error('[Tomos] Export failed:', e);
  }
}
