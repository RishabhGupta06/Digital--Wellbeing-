document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section-block');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active from all
            navItems.forEach(nav => nav.classList.remove('active'));
            sections.forEach(sec => sec.classList.remove('active-section'));
            
            // Add active to clicked
            item.classList.add('active');
            const targetId = item.getAttribute('href').substring(1);
            document.getElementById(targetId).classList.add('active-section');
        });
    });

    // Date
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString(undefined, options);

    // Load Data
    loadDashboardData();
});

let usageChart = null;

function loadDashboardData() {
    chrome.storage.local.get(['usage', 'limits', 'focusMode', 'focusSites', 'bedtimeMode', 'bedtimeStart', 'bedtimeEnd'], (data) => {
        
        // 1. Overview Chart
        renderChart(data.usage || {});

        // 2. Limits
        renderLimits(data.limits || {});

        // 3. Focus Mode
        document.getElementById('dashboard-focus-toggle').checked = data.focusMode || false;
        renderFocusSites(data.focusSites || []);

        // 4. Bedtime Mode
        document.getElementById('bedtime-toggle').checked = data.bedtimeMode || false;
        if (data.bedtimeStart) document.getElementById('bedtime-start').value = data.bedtimeStart;
        if (data.bedtimeEnd) document.getElementById('bedtime-end').value = data.bedtimeEnd;
    });
}

function renderChart(usageData) {
    const ctx = document.getElementById('usageChart').getContext('2d');
    
    // Sort by highest usage
    const sortedUsage = Object.entries(usageData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10); // Top 10

    const labels = sortedUsage.map(([domain]) => domain);
    const dataMins = sortedUsage.map(([, ms]) => (ms / 60000).toFixed(2));

    if (usageChart) usageChart.destroy();

    usageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time Spent (Minutes)',
                data: dataMins,
                backgroundColor: '#6366f1',
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#334155' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

// --- Limits Logic ---
document.getElementById('add-limit-btn').addEventListener('click', () => {
    const domain = document.getElementById('new-limit-domain').value.trim();
    const time = parseInt(document.getElementById('new-limit-time').value);
    
    if (domain && time > 0) {
        chrome.storage.local.get(['limits'], (res) => {
            const limits = res.limits || {};
            limits[domain] = time;
            chrome.storage.local.set({ limits }, () => {
                renderLimits(limits);
                document.getElementById('new-limit-domain').value = '';
                document.getElementById('new-limit-time').value = '';
            });
        });
    }
});

function renderLimits(limits) {
    const list = document.getElementById('limits-list');
    list.innerHTML = '';
    
    for (const [domain, time] of Object.entries(limits)) {
        const li = document.createElement('li');
        li.className = 'limit-item';
        li.innerHTML = `
            <div>
                <div class="domain-name">${domain}</div>
                <div class="limit-time">${time} minutes / day</div>
            </div>
            <button class="btn delete-btn" data-domain="${domain}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        `;
        list.appendChild(li);
    }

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const domain = e.currentTarget.getAttribute('data-domain');
            chrome.storage.local.get(['limits'], (res) => {
                const limits = res.limits || {};
                delete limits[domain];
                chrome.storage.local.set({ limits }, () => renderLimits(limits));
            });
        });
    });
}

// --- Focus Mode Logic ---
document.getElementById('dashboard-focus-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ focusMode: e.target.checked });
});

document.getElementById('add-focus-btn').addEventListener('click', () => {
    const domain = document.getElementById('new-focus-domain').value.trim();
    if (domain) {
        chrome.storage.local.get(['focusSites'], (res) => {
            const sites = res.focusSites || [];
            if (!sites.includes(domain)) {
                sites.push(domain);
                chrome.storage.local.set({ focusSites: sites }, () => {
                    renderFocusSites(sites);
                    document.getElementById('new-focus-domain').value = '';
                });
            }
        });
    }
});

function renderFocusSites(sites) {
    const list = document.getElementById('focus-sites-list');
    list.innerHTML = '';
    
    sites.forEach(domain => {
        const li = document.createElement('li');
        li.className = 'limit-item';
        li.innerHTML = `
            <div class="domain-name">${domain}</div>
            <button class="btn delete-btn focus-delete-btn" data-domain="${domain}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>
            </button>
        `;
        list.appendChild(li);
    });

    document.querySelectorAll('.focus-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const domain = e.currentTarget.getAttribute('data-domain');
            chrome.storage.local.get(['focusSites'], (res) => {
                const sites = res.focusSites || [];
                const newSites = sites.filter(s => s !== domain);
                chrome.storage.local.set({ focusSites: newSites }, () => renderFocusSites(newSites));
            });
        });
    });
}

// --- Bedtime Mode Logic ---
document.getElementById('bedtime-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ bedtimeMode: e.target.checked });
});

document.getElementById('save-bedtime-btn').addEventListener('click', () => {
    const start = document.getElementById('bedtime-start').value;
    const end = document.getElementById('bedtime-end').value;
    
    if (start && end) {
        chrome.storage.local.set({ bedtimeStart: start, bedtimeEnd: end }, () => {
            const btn = document.getElementById('save-bedtime-btn');
            const originalText = btn.textContent;
            btn.textContent = "Saved!";
            btn.style.backgroundColor = "#10b981"; // Success color
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = ""; // Reset to default CSS
            }, 2000);
        });
    }
});
