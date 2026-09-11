document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason');
    
    if (reason) {
        document.getElementById('reason-message').textContent = reason;
    }

    document.getElementById('dashboard-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('close-btn').addEventListener('click', () => {
        window.close(); // Only works if script opened it, but for extension tabs it usually works, or they just close the tab manually.
        // Alternative for extensions:
        chrome.tabs.getCurrent(function(tab) {
            chrome.tabs.remove(tab.id);
        });
    });
});
