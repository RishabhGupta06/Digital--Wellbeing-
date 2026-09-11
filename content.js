// content.js - Runs at document_start
const domain = window.location.hostname;

// Helper to get domain
function getBaseDomain(hostname) {
    // Basic implementation to handle www.youtube.com -> youtube.com
    let parts = hostname.split('.');
    if (parts.length > 2 && parts[0] === 'www') {
        parts.shift();
    }
    return parts.join('.');
}

const currentDomain = getBaseDomain(domain);

chrome.storage.local.get(['usage', 'limits', 'focusMode', 'focusSites', 'bedtimeMode', 'bedtimeStart', 'bedtimeEnd'], (res) => {
    
    let shouldBlock = false;
    let blockReason = "";

    // 1. Focus Mode
    if (res.focusMode && res.focusSites && (res.focusSites.includes(currentDomain) || res.focusSites.includes(domain))) {
        shouldBlock = true;
        blockReason = "Focus Mode is active.";
    }
    
    // 2. Bedtime Mode
    if (!shouldBlock && res.bedtimeMode && isBedtime(res.bedtimeStart, res.bedtimeEnd)) {
        shouldBlock = true;
        blockReason = "It's bedtime.";
    }

    // 3. Limits
    if (!shouldBlock && res.limits && res.usage) {
        const limitMins = res.limits[currentDomain] || res.limits[domain];
        if (limitMins) {
            const usageMs = (res.usage[currentDomain] || res.usage[domain]) || 0;
            if (usageMs >= limitMins * 60 * 1000) {
                shouldBlock = true;
                blockReason = "Time limit reached.";
            }
        }
    }

    if (shouldBlock) {
        // Immediately stop page from rendering
        document.documentElement.innerHTML = '';
        const url = chrome.runtime.getURL(`blocked/blocked.html?reason=${encodeURIComponent(blockReason)}`);
        window.location.href = url;
    }
});

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
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
}
