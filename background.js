// background.js - MV3 Compliant Time Tracking

// Helper to get domain from URL
function getDomain(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return null;
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
    }
    return hostname;
  } catch (e) {
    return null;
  }
}

// Initialize state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['usage', 'limits', 'focusMode', 'bedtimeMode'], (res) => {
    if (!res.usage) chrome.storage.local.set({ usage: {} });
    if (!res.limits) chrome.storage.local.set({ limits: {} });
    if (res.focusMode === undefined) chrome.storage.local.set({ focusMode: false, focusSites: [] });
    if (res.bedtimeMode === undefined) chrome.storage.local.set({ bedtimeMode: false, bedtimeStart: "22:00", bedtimeEnd: "07:00" });
    
    // Initial tracking state
    chrome.storage.local.set({
        activeDomain: null,
        lastUpdateTime: Date.now()
    });
  });

  // Set an alarm for daily reset (midnight)
  chrome.alarms.create("dailyReset", { periodInMinutes: 1440 });
  // Set an alarm for periodic time tracking (every 1 minute)
  chrome.alarms.create("trackerAlarm", { periodInMinutes: 1 });
});

// Update time in storage
async function commitTime() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['activeDomain', 'lastUpdateTime', 'usage', 'limits'], (res) => {
            if (!res.activeDomain || !res.lastUpdateTime) {
                resolve();
                return;
            }

            const now = Date.now();
            const timeDiff = now - res.lastUpdateTime;
            
            // The tracker alarm runs every 1 minute.
            // If the timeDiff is significantly larger (e.g., > 3 minutes),
            // it means the laptop was asleep or the browser was closed. We shouldn't count this time.
            if (timeDiff > 0 && timeDiff < 180000) {
                let usage = res.usage || {};
                if (!usage[res.activeDomain]) {
                    usage[res.activeDomain] = 0;
                }
                usage[res.activeDomain] += timeDiff;
                
                chrome.storage.local.set({ 
                    usage: usage,
                    lastUpdateTime: now // Reset the timer
                }, () => {
                    // Check limits after committing
                    if (res.limits && res.limits[res.activeDomain]) {
                        if (usage[res.activeDomain] >= res.limits[res.activeDomain] * 60 * 1000) {
                            blockActiveTab("Time limit reached.");
                        }
                    }
                    resolve();
                });
            } else {
                // If invalid time diff, just reset the timer
                chrome.storage.local.set({ lastUpdateTime: now }, resolve);
            }
        });
    });
}

async function updateActiveDomain(newUrl) {
    await commitTime(); // Save time for the PREVIOUS domain

    const newDomain = getDomain(newUrl);
    
    chrome.storage.local.set({
        activeDomain: newDomain,
        lastUpdateTime: Date.now()
    }, () => {
        if (newDomain) {
            checkAndEnforceLimits(newDomain);
        }
    });
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

// Alarms for background tasks
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyReset") {
    chrome.storage.local.set({ usage: {} });
  } else if (alarm.name === "trackerAlarm") {
    // Every 1 minute, commit the time so far
    commitTime();
  }
});

// Tab events
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  updateActiveDomain(tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id === tabId) {
        updateActiveDomain(changeInfo.url);
      }
    });
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus, stop tracking current domain
    await commitTime();
    chrome.storage.local.set({ activeDomain: null });
  } else {
    chrome.windows.get(windowId, (window) => {
      if (window && window.type === 'popup') {
        // Ignore extension popups, keep tracking the underlying page
        return;
      }
      chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
        if (tabs.length > 0) {
          updateActiveDomain(tabs[0].url);
        }
      });
    });
  }
});

// Sync state when service worker starts or wakes up
chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
  if (tabs && tabs.length > 0) {
    updateActiveDomain(tabs[0].url);
  }
});
