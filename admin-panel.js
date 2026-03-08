// Admin Panel Enhanced
let allUsers = []
let allWorkspaces = []
let allReports = []

// Check if user is admin
async function checkAdminAccess() {
    try {
        const response = await fetchWithAuth('/api/me')
        if (!response) return false
        const data = await response.json()

        const role = window.normalizeGlobalRole
            ? window.normalizeGlobalRole(data.user && data.user.role)
            : String((data.user && data.user.role) || 'user').toLowerCase()
        const isAdmin = window.isAdminRole
            ? window.isAdminRole(role)
            : ['owner', 'co-owner', 'administrator', 'moderator'].includes(role)

        if (window.applyOwnerOnlyVisibility) {
            window.applyOwnerOnlyVisibility(role)
        }

        if (window.applyAdminOnlyVisibility) {
            window.applyAdminOnlyVisibility(role)
        }

        if (!data.success || !isAdmin) {
            window.location.href = '/developerspaces.html'
            return false
        }

        const displayName = data.user.name || data.user.username || data.user.email || 'Admin'
        showActionMessage(`Welcome, ${displayName}!`, 'success')
        return true
    } catch (err) {
        console.error('Admin check error:', err)
        window.location.href = '/login.html'
        return false
    }
}

let statusFadeTimer = null

function showActionMessage(message, type = 'info') {
    const statusEl = document.getElementById('admin-status')
    if (!statusEl) return

    statusEl.textContent = message

    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: 'var(--line-clr)'
    }

    statusEl.style.backgroundColor = colors[type] || colors.info

    if (statusFadeTimer) {
        clearTimeout(statusFadeTimer)
    }

    statusFadeTimer = setTimeout(() => {
        statusEl.textContent = ''
        statusEl.style.backgroundColor = colors.info
    }, 4000)
}

// Update dashboard statistics
function updateDashboard() {
    const pendingReports = allReports.filter(r => r.status === 'pending').length
    const totalAnnouncements = document.querySelectorAll('#siteAnnouncementsList .announcement-item').length

    document.getElementById('stat-users').textContent = allUsers.length
    document.getElementById('stat-workspaces').textContent = allWorkspaces.length
    document.getElementById('stat-reports').textContent = pendingReports
    document.getElementById('stat-announcements').textContent = totalAnnouncements
}

// Load all users
async function loadUsers() {
    try {
        const response = await fetchWithAuth('/api/admin?section=users')
        if (!response) return
        const data = await response.json()
        
        if (!data.success) {
            console.error('Failed to load users:', data.errors)
            return
        }
        
        allUsers = data.users
        renderUsers(allUsers)
        updateDashboard()
    } catch (err) {
        console.error('Load users error:', err)
    }
}

// Render users table
function renderUsers(users) {
    const tbody = document.querySelector('#users-table tbody')
    tbody.innerHTML = ''
    
    users.forEach(user => {
        const row = document.createElement('tr')
        const role = user.role || 'user'
        const roleColor = getRoleColor(role)
        const roleDisplay = role.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
        const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'
        const displayName = user.username || user.name || user.email || '-'
        const subscriptionStatus = (user.subscriptionStatus || 'free').toUpperCase()
        const shortId = formatEntityId(user.id)

        row.innerHTML = `
            <td data-label="ID" title="${escapeHtml(user.id)}">${escapeHtml(shortId)}</td>
            <td class="user-name" data-label="Username">${escapeHtml(displayName)}</td>
            <td class="user-email" data-label="Email">${escapeHtml(user.email || '-')}</td>
            <td data-label="Role"><span class="role-badge" style="background-color: ${roleColor}">${roleDisplay}</span></td>
            <td data-label="Subscription"><span class="subscription-badge">${subscriptionStatus}</span></td>
            <td data-label="Created">${createdAt}</td>
            <td data-label="Actions">
                <div class="action-buttons">
                    ${subscriptionStatus === 'LITE' 
                        ? `<button class="btn-remove-lite" data-action="subscription" data-status="free" data-user-id="${user.id}">Remove Lite</button>`
                        : `<button class="btn-give-lite" data-action="subscription" data-status="lite" data-user-id="${user.id}">Give Lite</button>`
                    }
                    <button class="btn-change-role" data-action="role" data-user-id="${user.id}" data-current-role="${role}">Change Role</button>
                    <button class="btn-delete" data-action="delete-user" data-user-id="${user.id}">Delete</button>
                </div>
            </td>
        `
        row.dataset.username = displayName
        row.dataset.email = user.email
        tbody.appendChild(row)
    })
}

// Load all workspaces
async function loadWorkspaces() {
    try {
        const response = await fetchWithAuth('/api/admin?section=workspaces')
        if (!response) return
        const data = await response.json()
        
        if (!data.success) {
            console.error('Failed to load workspaces:', data.errors)
            return
        }
        
        allWorkspaces = data.workspaces
        renderWorkspaces(allWorkspaces)
        updateDashboard()
    } catch (err) {
        console.error('Load workspaces error:', err)
    }
}

// Render workspaces table
function renderWorkspaces(workspaces) {
    const tbody = document.querySelector('#workspaces-table tbody')
    tbody.innerHTML = ''
    
    workspaces.forEach(workspace => {
        const row = document.createElement('tr')
        const shortId = formatEntityId(workspace.id)
        const createdAt = workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : '-'
        row.innerHTML = `
            <td data-label="ID" title="${escapeHtml(workspace.id)}">${escapeHtml(shortId)}</td>
            <td class="workspace-name" data-label="Name">${escapeHtml(workspace.name)}</td>
            <td class="workspace-creator" data-label="Creator">${escapeHtml(workspace.creatorName || 'Unknown')} (${escapeHtml(workspace.creatorEmail || 'Unknown')})</td>
            <td class="workspace-description" data-label="Description">${escapeHtml(workspace.description || 'N/A')}</td>
            <td data-label="Created">${createdAt}</td>
            <td data-label="Actions">
                <div class="action-buttons">
                    <button class="btn-delete" data-action="delete-workspace" data-workspace-id="${workspace.id}">Delete</button>
                </div>
            </td>
        `
        row.dataset.workspaceName = workspace.name
        tbody.appendChild(row)
    })
}

// Load all reports
async function loadReports() {
    try {
        const response = await fetchWithAuth('/api/admin?section=reports')
        if (!response) return
        const data = await response.json()
        
        if (!data.success) {
            console.error('Failed to load reports:', data.errors)
            return
        }
        
        allReports = data.reports
        renderReports(allReports)
        updateDashboard()
    } catch (err) {
        console.error('Load reports error:', err)
    }
}

// Render reports table
function renderReports(reports) {
    const tbody = document.querySelector('#reports-table tbody')
    tbody.innerHTML = ''
    
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No reports yet</td></tr>'
        return
    }
    
    reports.forEach(report => {
        const row = document.createElement('tr')
        const shortId = formatEntityId(report.id)
        const workspaceName = report.workspaceName || report.workspace_name || 'Unknown'
        const reporterName = report.reporterName || report.reporter_username || 'Unknown'
        const reporterEmail = report.reporterEmail || report.reporter_email || 'Unknown'
        const reportStatus = String(report.status || 'pending').toLowerCase()
        const createdAtRaw = report.createdAt || report.created_at
        const createdAt = createdAtRaw ? new Date(createdAtRaw).toLocaleDateString() : '-'
        
        row.innerHTML = `
            <td data-label="ID" title="${escapeHtml(report.id)}">${escapeHtml(shortId)}</td>
            <td class="report-workspace" data-label="Workspace">${escapeHtml(workspaceName)}</td>
            <td class="report-reporter" data-label="Reporter">${escapeHtml(reporterName)} (${escapeHtml(reporterEmail)})</td>
            <td class="report-reason" data-label="Reason">${escapeHtml(report.reason)}</td>
            <td class="report-description" data-label="Description">${escapeHtml(report.description || 'N/A')}</td>
            <td data-label="Status"><span class="status-badge status-${reportStatus}">${reportStatus}</span></td>
            <td data-label="Created">${createdAt}</td>
            <td data-label="Actions">
                <div class="action-buttons">
                    ${reportStatus === 'pending' 
                        ? `<button class="btn-status" data-action="report-status" data-status="reviewed" data-report-id="${report.id}">Review</button>`
                        : ''
                    }
                    ${reportStatus !== 'resolved' 
                        ? `<button class="btn-status" data-action="report-status" data-status="resolved" data-report-id="${report.id}">Resolve</button>`
                        : ''
                    }
                    ${reportStatus !== 'dismissed' 
                        ? `<button class="btn-status" data-action="report-status" data-status="dismissed" data-report-id="${report.id}">Dismiss</button>`
                        : ''
                    }
                </div>
            </td>
        `
        tbody.appendChild(row)
    })
}

// Search and Filter functions
function filterUsers() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase()
    const roleFilter = document.getElementById('user-role-filter').value

    const filtered = allUsers.filter(user => {
        const matchesSearch = !searchTerm || 
            (user.username && user.username.toLowerCase().includes(searchTerm)) ||
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm))
        
        const matchesRole = !roleFilter || (user.role || 'user') === roleFilter
        
        return matchesSearch && matchesRole
    })

    renderUsers(filtered)
}

function filterWorkspaces() {
    const searchTerm = document.getElementById('workspace-search').value.toLowerCase()

    const filtered = allWorkspaces.filter(workspace => {
        return !searchTerm || 
            (workspace.name && workspace.name.toLowerCase().includes(searchTerm)) ||
            (workspace.description && workspace.description.toLowerCase().includes(searchTerm))
    })

    renderWorkspaces(filtered)
}

// Give or remove subscription
async function giveSubscription(userId, status) {
    const action = status === 'lite' ? 'give Lite subscription to' : 'remove Lite subscription from'
    if (!confirm(`Are you sure you want to ${action} this user?`)) return
    
    try {
        const response = await fetchWithAuth('/api/admin?section=users', {
            method: 'PATCH',
            body: JSON.stringify({ userId, action: 'subscription', value: status })
        })
        if (!response) return
        
        const data = await response.json()
        
        if (data.success) {
            showActionMessage('Subscription updated successfully.', 'success')
            loadUsers()
        } else {
            showActionMessage(`Subscription update failed: ${data.errors.join(', ')}`, 'error')
        }
    } catch (err) {
        console.error('Update subscription error:', err)
        showActionMessage('Failed to update subscription.', 'error')
    }
}

// Change user role
async function changeRole(userId, username, currentRole) {
    const roles = ['user', 'staff', 'moderator', 'administrator', 'co-owner', 'owner']
    const roleDescriptions = {
        'user': 'User - No admin access',
        'staff': 'Staff - Employee access and elevated tooling',
        'moderator': 'Moderator - Can view reports and manage basic content',
        'administrator': 'Administrator - Can manage users and workspaces',
        'co-owner': 'Co-Owner - Full access except changing owner role',
        'owner': 'Owner - Full system access'
    }
    
    let message = `Change role for ${username}:\n\nCurrent role: ${currentRole.replace('-', ' ').toUpperCase()}\n\nSelect new role:\n\n`
    roles.forEach((role, index) => {
        message += `${index + 1}. ${roleDescriptions[role]}\n`
    })
    message += '\nEnter number (1-6):'
    
    const input = prompt(message)
    if (!input) return
    
    const roleIndex = parseInt(input) - 1
    if (roleIndex < 0 || roleIndex >= roles.length) {
        alert('Invalid selection')
        return
    }
    
    const newRole = roles[roleIndex]
    if (newRole === currentRole) {
        alert('User already has this role')
        return
    }
    
    if (!confirm(`Are you sure you want to change ${username}'s role to ${newRole.replace('-', ' ').toUpperCase()}?`)) return
    
    try {
        const response = await fetchWithAuth('/api/admin?section=users', {
            method: 'PATCH',
            body: JSON.stringify({ userId, action: 'role', value: newRole })
        })
        if (!response) return
        
        const data = await response.json()
        
        if (data.success) {
            showActionMessage(`Role updated to ${newRole.replace('-', ' ').toUpperCase()}.`, 'success')
            loadUsers()
        } else {
            showActionMessage(`Role update failed: ${data.errors.join(', ')}`, 'error')
        }
    } catch (err) {
        console.error('Change role error:', err)
        showActionMessage('Failed to change role.', 'error')
    }
}

// Get color for role badge
function getRoleColor(role) {
    const colors = {
        'owner': '#ef4444',
        'co-owner': '#f97316',
        'administrator': '#3b82f6',
        'moderator': '#06b6d4',
        'staff': '#14b8a6',
        'user': '#6b7280'
    }
    return colors[role] || colors['user']
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone!')) return
    
    try {
        const response = await fetchWithAuth(`/api/admin?section=users&id=${encodeURIComponent(userId)}`, {
            method: 'DELETE'
        })
        if (!response) return
        
        const data = await response.json()
        
        if (data.success) {
            showActionMessage('User deleted successfully.', 'success')
            loadUsers()
        } else {
            showActionMessage(`Delete user failed: ${data.errors.join(', ')}`, 'error')
        }
    } catch (err) {
        console.error('Delete user error:', err)
        showActionMessage('Failed to delete user.', 'error')
    }
}

// Delete workspace
async function deleteWorkspace(workspaceId, workspaceName) {
    if (!confirm(`Are you sure you want to delete workspace "${workspaceName}"? This action cannot be undone!`)) return
    
    try {
        const response = await fetchWithAuth(`/api/admin?section=workspaces&id=${encodeURIComponent(workspaceId)}`, {
            method: 'DELETE'
        })
        if (!response) return
        
        const data = await response.json()
        
        if (data.success) {
            showActionMessage('Workspace deleted successfully.', 'success')
            loadWorkspaces()
        } else {
            showActionMessage(`Delete workspace failed: ${data.errors.join(', ')}`, 'error')
        }
    } catch (err) {
        console.error('Delete workspace error:', err)
        showActionMessage('Failed to delete workspace.', 'error')
    }
}

// Update report status
async function updateReportStatus(reportId, status) {
    try {
        const response = await fetchWithAuth('/api/admin?section=reports', {
            method: 'PATCH',
            body: JSON.stringify({ reportId, status })
        })
        if (!response) return
        
        const data = await response.json()
        
        if (data.success) {
            showActionMessage(`Report status updated to ${status}.`, 'success')
            loadReports()
        } else {
            showActionMessage(`Report update failed: ${data.errors.join(', ')}`, 'error')
        }
    } catch (err) {
        console.error('Update report status error:', err)
        showActionMessage('Failed to update report status.', 'error')
    }
}

// Save system settings
async function saveSystemSettings() {
    const button = document.getElementById('save-system-settings')
    const maxWorkspaceSize = document.getElementById('max-workspace-size').value
    const maxUsersPerWorkspace = document.getElementById('max-users-per-workspace').value
    const maintenanceMode = document.getElementById('maintenance-mode').value
    const allowRegistrations = document.getElementById('allow-registrations').value

    if (!maxWorkspaceSize || !maxUsersPerWorkspace) {
        showActionMessage('Please fill in all required fields.', 'error')
        return
    }

    try {
        const response = await fetchWithAuth('/api/admin?section=settings', {
            method: 'PATCH',
            body: JSON.stringify({
                maxWorkspaceSize: parseInt(maxWorkspaceSize),
                maxUsersPerWorkspace: parseInt(maxUsersPerWorkspace),
                maintenanceMode: maintenanceMode === 'on',
                allowRegistrations: allowRegistrations === 'true'
            })
        })

        if (!response) return
        const data = await response.json()

        if (data.success) {
            showActionMessage('System settings saved successfully.', 'success')
        } else {
            showActionMessage(`Save failed: ${data.error || 'Unknown error'}`, 'error')
        }
    } catch (err) {
        console.error('Save settings error:', err)
        showActionMessage('Failed to save settings.', 'error')
    }
}

function handleUserAction(event) {
    const button = event.target.closest('button')
    if (!button) return

    const action = button.dataset.action
    if (!action) return

    if (action === 'subscription') {
        const userId = button.dataset.userId
        const status = button.dataset.status
        if (userId && status) {
            giveSubscription(userId, status)
        }
        return
    }

    if (action === 'role') {
        const userId = button.dataset.userId
        const row = button.closest('tr')
        const username = row ? row.dataset.username : ''
        const currentRole = button.dataset.currentRole || 'user'
        if (userId && username) {
            changeRole(userId, username, currentRole)
        }
        return
    }

    if (action === 'delete-user') {
        const userId = button.dataset.userId
        if (userId) {
            deleteUser(userId)
        }
    }
}

function handleWorkspaceAction(event) {
    const button = event.target.closest('button')
    if (!button || button.dataset.action !== 'delete-workspace') return

    const workspaceId = button.dataset.workspaceId
    const row = button.closest('tr')
    const workspaceName = row ? row.dataset.workspaceName : ''

    if (workspaceId && workspaceName) {
        deleteWorkspace(workspaceId, workspaceName)
    }
}

function handleReportAction(event) {
    const button = event.target.closest('button')
    if (!button || button.dataset.action !== 'report-status') return

    const reportId = button.dataset.reportId
    const status = button.dataset.status
    if (reportId && status) {
        updateReportStatus(reportId, status)
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

function formatEntityId(value) {
    const fullId = String(value || '-')
    if (fullId === '-' || fullId.length <= 12) {
        return fullId
    }
    return `${fullId.slice(0, 6)}…${fullId.slice(-4)}`
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAdminAccess()
    if (isAdmin) {
        // Setup event listeners for tables
        const usersTable = document.getElementById('users-table')
        const workspacesTable = document.getElementById('workspaces-table')
        const reportsTable = document.getElementById('reports-table')

        if (usersTable) usersTable.addEventListener('click', handleUserAction)
        if (workspacesTable) workspacesTable.addEventListener('click', handleWorkspaceAction)
        if (reportsTable) reportsTable.addEventListener('click', handleReportAction)

        // Setup search and filter listeners
        const userSearch = document.getElementById('user-search')
        const userRoleFilter = document.getElementById('user-role-filter')
        const workspaceSearch = document.getElementById('workspace-search')
        const saveSettingsBtn = document.getElementById('save-system-settings')

        if (userSearch) userSearch.addEventListener('input', filterUsers)
        if (userRoleFilter) userRoleFilter.addEventListener('change', filterUsers)
        if (workspaceSearch) workspaceSearch.addEventListener('input', filterWorkspaces)
        if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSystemSettings)

        // Load all data
        loadUsers()
        loadWorkspaces()
        loadReports()
    }
})

