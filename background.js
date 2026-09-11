let activeDomain = null;
let lastUpdateTime = Date.now();
const UPDATE_INTERVAL_MS = 1000;

// Initialize state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['usage', 'limits', 'focusMode', 'bedtimeMode'], (res) => {
    if (!res.usage) chrome.storage.local.set({ usage: {} });
    if (!res.limits) chrome.storage.local.set({ limits: {} });
    if (res.focusMode === undefined) chrome.storage.local.set({ focusMode: false, focusSites: [] });
    if (res.bedtimeMode === undefined) chrome.storage.local.set({ bedtimeMode: false, bedtimeStart: "22:00", bedtimeEnd: "07:00" });
  });

  // Set an alarm for daily reset (midnight)
  chrome.alarms.create("dailyReset", { periodInMinutes: 1440 });
});

// Helper to get domain from URL
function getDomain(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

// Update time tracking periodically
setInterval(async () => {
  if (!activeDomain) return;

  const now = Date.now();
  const timeDiff = now - lastUpdateTime;
  lastUpdateTime = now;

  // Add time to storage
  chrome.storage.local.get(['usage', 'limits'], (res) => {
    let usage = res.usage || {};
    let limits = res.limits || {};

    if (!usage[activeDomain]) {
      usage[activeDomain] = 0;
    }
    
    // timeDiff is in ms, we store ms
    usage[activeDomain] += timeDiff;
    chrome.storage.local.set({ usage });

    // Check if limit exceeded
    if (limits[activeDomain] && usage[activeDomain] >= limits[activeDomain] * 60 * 1000) {
      blockActiveTab();
    }
  });
}, UPDATE_INTERVAL_MS);

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  updateActiveDomain(tab.url);
});

// Handle URL updates within a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id === tabId) {
        updateActiveDomain(changeInfo.url);
      }
    });
  }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    activeDomain = null; // Browser lost focus
  } else {
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      if (tabs.length > 0) {
        updateActiveDomain(tabs[0].url);
      }
    });
  }
});

function updateActiveDomain(url) {
  const domain = getDomain(url);
  activeDomain = domain;
  lastUpdateTime = Date.now();
  
  if (domain) {
    checkAndEnforceLimits(domain);
  }
}

function checkAndEnforceLimits(domain) {
  chrome.storage.local.get(['usage', 'limits', 'focusMode', 'focusSites', 'bedtimeMode', 'bedtimeStart', 'bedtimeEnd'], (res) => {
    // 1. Focus Mode
    if (res.focusMode && res.focusSites && res.focusSites.includes(domain)) {
      blockActiveTab("Focus Mode is active.");
      return;
    }
    
    // 2. Bedtime Mode
    if (res.bedtimeMode && isBedtime(res.bedtimeStart, res.bedtimeEnd)) {
      blockActiveTab("It's bedtime.");
      return;
    }

    // 3. Limits
    if (res.limits && res.usage && res.limits[domain]) {
      const limitMs = res.limits[domain] * 60 * 1000;
      const usageMs = res.usage[domain] || 0;
      if (usageMs >= limitMs) {
        blockActiveTab("Time limit reached.");
      }
    }
  });
}

function isBedtime(start, end) {
  if (!start || !end) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startH, startM] = start.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  
  const [endH, endM] = end.split(':').map(Number);
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight (e.g., 22:00 to 07:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function blockActiveTab(reason) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const url = chrome.runtime.getURL(`blocked/blocked.html?reason=${encodeURIComponent(reason || 'Limit Reached')}`);
      chrome.tabs.update(tabs[0].id, { url: url });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyReset") {
    // Clear usage data at midnight
    chrome.storage.local.set({ usage: {} });
  }
});
