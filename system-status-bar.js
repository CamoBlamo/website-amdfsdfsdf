// System Status Bar - Monitors incident.io for incidents
class SystemStatusBar {
    constructor(options = {}) {
        this.workspaceId = options.workspaceId || localStorage.getItem('incident_io_workspace_id') || '';
        this.pollInterval = options.pollInterval || 60000; // 60 seconds
        this.statusBarEl = null;
        this.statusTextEl = null;
        this.statusIndicatorEl = null;
        this.init();
    }

    init() {
        this.createStatusBar();
        this.checkStatus();
        
        // Poll for updates
        if (this.workspaceId) {
            setInterval(() => this.checkStatus(), this.pollInterval);
        }
    }

    createStatusBar() {
        // Check if status bar already exists
        if (document.getElementById('system-status-bar')) {
            this.statusBarEl = document.getElementById('system-status-bar');
            this.statusIndicatorEl = document.getElementById('status-indicator');
            this.statusTextEl = document.getElementById('status-text');
            return;
        }

        // Create the status bar element
        const bar = document.createElement('div');
        bar.id = 'system-status-bar';
        bar.className = 'system-status-bar operational';
        bar.innerHTML = `
            <div class="status-bar-content">
                <div class="status-indicator" id="status-indicator"></div>
                <span class="status-text" id="status-text">All systems operational</span>
                <a href="https://statuspage.incident.io/devdock" class="status-link" target="_blank" rel="noopener">View status page →</a>
            </div>
        `;

        // Insert at the very top of the body
        document.body.insertBefore(bar, document.body.firstChild);
        
        this.statusBarEl = bar;
        this.statusIndicatorEl = document.getElementById('status-indicator');
        this.statusTextEl = document.getElementById('status-text');
    }

    async checkStatus() {
        if (!this.workspaceId) {
            // No workspace ID configured
            return;
        }

        try {
            // Fetch active incidents from incident.io public API
            const response = await fetch(`https://api.incident.io/v1/incidents?status[]=investigating&status[]=identified&status[]=monitoring`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                console.warn('Could not fetch incident.io status');
                return;
            }

            const data = await response.json();
            this.updateStatus(data.incidents || []);
        } catch (error) {
            console.warn('Status bar error:', error);
        }
    }

    updateStatus(incidents) {
        if (!incidents || incidents.length === 0) {
            // All systems operational
            this.setStatus('operational', 'All systems operational', 'operational');
            return;
        }

        // Check severity of incidents
        let maxSeverity = 'degraded'; // default
        let affectedServices = [];

        incidents.forEach(incident => {
            if (incident.severity === 'critical') {
                maxSeverity = 'critical';
            } else if (incident.severity === 'high' && maxSeverity !== 'critical') {
                maxSeverity = 'high';
            }
            
            if (incident.name) {
                affectedServices.push(incident.name);
            }
        });

        const statusMap = {
            'critical': { text: 'Critical incident detected', class: 'critical' },
            'high': { text: `${incidents.length} incident${incidents.length !== 1 ? 's' : ''} detected`, class: 'degraded' },
            'degraded': { text: `${incidents.length} incident${incidents.length !== 1 ? 's' : ''} detected`, class: 'degraded' }
        };

        const status = statusMap[maxSeverity] || statusMap['degraded'];
        this.setStatus(status.class, status.text, maxSeverity);
    }

    setStatus(className, text, severity) {
        if (!this.statusBarEl) return;

        // Update class
        this.statusBarEl.className = `system-status-bar ${className}`;
        
        // Update text
        if (this.statusTextEl) {
            this.statusTextEl.textContent = text;
        }

        // Store current status in localStorage
        localStorage.setItem('system_status', JSON.stringify({
            status: className,
            severity,
            timestamp: Date.now()
        }));
    }

    setWorkspaceId(id) {
        this.workspaceId = id;
        localStorage.setItem('incident_io_workspace_id', id);
        this.checkStatus();
    }
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.systemStatusBar = new SystemStatusBar();
});

// Also support manual initialization if needed
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.systemStatusBar = new SystemStatusBar();
    });
} else {
    window.systemStatusBar = new SystemStatusBar();
}
