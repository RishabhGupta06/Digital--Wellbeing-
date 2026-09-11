document.addEventListener('DOMContentLoaded', async () => {
    // Open dashboard
    document.getElementById('dashboard-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Get current tab domain
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs.length === 0) return;
    
    let url = tabs[0].url;
    let domain = "Unknown";
    
    if (url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://')) {
        try {
            let hostname = new URL(url).hostname;
            if (hostname.startsWith('www.')) hostname = hostname.substring(4);
            domain = hostname;
        } catch(e) {}
    }
    
    document.getElementById('current-domain').textContent = domain;

    // Load Focus Mode state
    chrome.storage.local.get(['focusMode'], (res) => {
        const focusToggle = document.getElementById('focus-toggle');
        if (res.focusMode) {
            focusToggle.checked = true;
        }
        
        focusToggle.addEventListener('change', (e) => {
            chrome.storage.local.set({focusMode: e.target.checked});
        });
    });

    // Load Usage and Update UI
    if (domain !== "Unknown") {
        updateTimeDisplay(domain);
        // Refresh every second while popup is open
        setInterval(() => updateTimeDisplay(domain), 1000);
    } else {
        document.getElementById('time-spent').textContent = "0m";
    }
});

function updateTimeDisplay(domain) {
    chrome.storage.local.get(['usage', 'limits', 'activeDomain', 'lastUpdateTime'], (res) => {
        let usageMs = (res.usage && res.usage[domain]) ? res.usage[domain] : 0;
        
        // Add live time if this is the active domain
        if (res.activeDomain === domain && res.lastUpdateTime) {
            usageMs += (Date.now() - res.lastUpdateTime);
        }
        
        const limitMins = (res.limits && res.limits[domain]) ? res.limits[domain] : null;
        
        const usageMins = Math.floor(usageMs / 60000);
        const usageSecs = Math.floor((usageMs % 60000) / 1000);
        
        // Format time string
        let timeString = "";
        if (usageMins > 0) {
            timeString = `${usageMins}m ${usageSecs}s`;
        } else {
            timeString = `${usageSecs}s`;
        }
        
        document.getElementById('time-spent').textContent = timeString;
        
        // Update limit text and circle progress
        const circle = document.querySelector('.time-circle');
        
        if (limitMins) {
            document.getElementById('limit-text').textContent = `Limit: ${limitMins}m`;
            
            // Calculate percentage for conic gradient
            let percentage = (usageMins / limitMins) * 100;
            if (percentage > 100) percentage = 100;
            
            // Color changes as it gets closer to limit
            let color = 'var(--accent-color)';
            if (percentage > 80) color = '#ef4444'; // Red
            else if (percentage > 50) color = '#f59e0b'; // Amber
            
            circle.style.background = `conic-gradient(${color} ${percentage}%, #334155 0%)`;
        } else {
            document.getElementById('limit-text').textContent = `No limit set`;
            circle.style.background = `conic-gradient(var(--accent-color) 0%, #334155 0%)`;
        }
    });
}
