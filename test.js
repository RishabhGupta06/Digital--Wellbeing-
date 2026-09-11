const fs = require('fs');

// Mock chrome API
global.chrome = {
    runtime: {
        onInstalled: { addListener: () => {} },
        getURL: (path) => `chrome-extension://123/${path}`
    },
    storage: {
        local: {
            data: {},
            get: function(keys, cb) {
                let res = {};
                keys.forEach(k => res[k] = this.data[k]);
                setTimeout(() => cb(res), 0);
            },
            set: function(obj, cb) {
                Object.assign(this.data, obj);
                if (cb) setTimeout(cb, 0);
            }
        }
    },
    alarms: {
        create: () => {},
        onAlarm: { addListener: () => {} }
    },
    tabs: {
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
        query: (query, cb) => setTimeout(() => cb([{id: 1}]), 0),
        update: (id, config) => {
            console.log(`[MOCK] Tab ${id} updated to URL: ${config.url}`);
            global.blockedUrls.push(config.url);
        }
    },
    windows: {
        onFocusChanged: { addListener: () => {} },
        WINDOW_ID_NONE: -1
    }
};

global.blockedUrls = [];

// Load background.js logic
const code = fs.readFileSync('background.js', 'utf8');
eval(code);

async function runTest() {
    console.log("Setting up initial state...");
    chrome.storage.local.data = {
        usage: {},
        limits: { 'youtube.com': 1 }, // 1 minute limit
        focusMode: false,
        focusSites: [],
        bedtimeMode: false,
        activeDomain: null,
        lastUpdateTime: Date.now()
    };

    console.log("Navigating to YouTube...");
    await updateActiveDomain("https://www.youtube.com/watch?v=123");
    
    // Check storage immediately
    let data = chrome.storage.local.data;
    console.log(`Active Domain: ${data.activeDomain}`); // should be youtube.com
    
    console.log("Simulating 61 seconds passing...");
    // Force lastUpdateTime 61 seconds into the past
    chrome.storage.local.data.lastUpdateTime = Date.now() - 61000;
    
    console.log("Running commitTime (alarm fires)...");
    await commitTime();
    await new Promise(r => setTimeout(r, 100)); // wait for tabs API
    
    data = chrome.storage.local.data;
    console.log(`Usage for youtube.com: ${data.usage['youtube.com']} ms`);
    
    if (global.blockedUrls.length > 0) {
        console.log(`SUCCESS: Tab was blocked! URL: ${global.blockedUrls[0]}`);
    } else {
        console.log(`FAIL: Tab was NOT blocked.`);
    }

    console.log("Test Focus Mode...");
    chrome.storage.local.data.focusMode = true;
    chrome.storage.local.data.focusSites = ['reddit.com'];
    
    console.log("Navigating to reddit...");
    await updateActiveDomain("https://old.reddit.com/r/programming");
    // Wait for async updateActiveDomain to call checkAndEnforceLimits
    await new Promise(r => setTimeout(r, 100));

    if (global.blockedUrls.length > 1) {
        console.log(`SUCCESS: Reddit was blocked by focus mode.`);
    } else {
        console.log(`FAIL: Reddit was NOT blocked.`);
    }
}

runTest();
