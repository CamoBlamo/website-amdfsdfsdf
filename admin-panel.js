// Check if user is admin
async function checkAdminAccess() {
    try {
        const response = await fetchWithAuth('/api/me')
        if (!response) return false
        const data = await response.json()

        const role = (data.user && data.user.role) || 'user'
        const isAdmin = ['owner', 'co-owner', 'administrator', 'moderator'].includes(role)

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
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#2a2a2a'
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
        
        const tbody = document.querySelector('#users-table tbody')
        tbody.innerHTML = ''
        
        data.users.forEach(user => {
            const row = document.createElement('tr')
            const role = user.role || 'user'
            const roleColor = getRoleColor(role)
            const roleDisplay = role.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
            const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'
            const displayName = user.username || user.name || user.email || '-'
            const subscriptionStatus = (user.subscriptionStatus || 'free').toUpperCase()

            row.innerHTML = `
                <td>${user.id}</td>
                <td class="user-name"></td>
                <td class="user-email"></td>
                <td><span class="role-badge" style="background-color: ${roleColor}">${roleDisplay}</span></td>
                <td><span class="subscription-badge">${subscriptionStatus}</span></td>
                <td>${createdAt}</td>
                <td>
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

            row.querySelector('.user-name').textContent = displayName
            row.querySelector('.user-email').textContent = user.email || '-'
            row.dataset.username = displayName

            tbody.appendChild(row)
        })
    } catch (err) {
        console.error('Load users error:', err)
    }
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
        
        const tbody = document.querySelector('#workspaces-table tbody')
        tbody.innerHTML = ''
        
        data.workspaces.forEach(workspace => {
            const row = document.createElement('tr')
            row.innerHTML = `
                <td>${workspace.id}</td>
                <td class="workspace-name"></td>
                <td class="workspace-creator"></td>
                <td class="workspace-description"></td>
                <td>${workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-delete" data-action="delete-workspace" data-workspace-id="${workspace.id}">Delete</button>
                    </div>
                </td>
            `

            row.querySelector('.workspace-name').textContent = workspace.name
            row.querySelector('.workspace-creator').textContent = `${workspace.creatorName} (${workspace.creatorEmail})`
            row.querySelector('.workspace-description').textContent = workspace.description || 'N/A'
            row.dataset.workspaceName = workspace.name

            tbody.appendChild(row)
        })
    } catch (err) {
        console.error('Load workspaces error:', err)
    }
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
        
        const tbody = document.querySelector('#reports-table tbody')
        tbody.innerHTML = ''
        
        if (data.reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No reports yet</td></tr>'
            return
        }
        
        data.reports.forEach(report => {
            const row = document.createElement('tr')
            row.innerHTML = `
                <td>${report.id}</td>
                <td class="report-workspace"></td>
                <td class="report-reporter"></td>
                <td class="report-reason"></td>
                <td class="report-description"></td>
                <td><span class="status-badge status-${report.status}">${report.status}</span></td>
                <td>${new Date(report.created_at).toLocaleDateString()}</td>
                <td>
                    <div class="action-buttons">
                        ${report.status === 'pending' 
                            ? `<button class="btn-status" data-action="report-status" data-status="reviewed" data-report-id="${report.id}">Review</button>`
                            : ''
                        }
                        ${report.status !== 'resolved' 
                            ? `<button class="btn-status" data-action="report-status" data-status="resolved" data-report-id="${report.id}">Resolve</button>`
                            : ''
                        }
                        ${report.status !== 'dismissed' 
                            ? `<button class="btn-status" data-action="report-status" data-status="dismissed" data-report-id="${report.id}">Dismiss</button>`
                            : ''
                        }
                    </div>
                </td>
            `

            row.querySelector('.report-workspace').textContent = report.workspaceName
            row.querySelector('.report-reporter').textContent = `${report.reporterName} (${report.reporterEmail})`
            row.querySelector('.report-reason').textContent = report.reason
            row.querySelector('.report-description').textContent = report.description || 'N/A'

            tbody.appendChild(row)
        })
    } catch (err) {
        console.error('Load reports error:', err)
    }
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

// Toggle admin status
async function toggleAdmin(userId, isAdmin) {
    const action = isAdmin ? 'grant admin access to' : 'remove admin access from'
    if (!confirm(`Are you sure you want to ${action} this user?`)) return
    
    try {
        const response = await fetchWithAuth('/api/admin?section=users', {
            method: 'PATCH',
            body: JSON.stringify({ userId, action: 'role', value: isAdmin ? 'administrator' : 'user' })
        })
        if (!response) return
        
        const data = await response.json()
        
        if (data.success) {
            showActionMessage('Admin status updated successfully.', 'success')
            loadUsers()
        } else {
            showActionMessage(`Admin status update failed: ${data.errors.join(', ')}`, 'error')
        }
    } catch (err) {
        console.error('Update admin status error:', err)
        showActionMessage('Failed to update admin status.', 'error')
    }
}

// Change user role
async function changeRole(userId, username, currentRole) {
    const roles = ['user', 'moderator', 'administrator', 'co-owner', 'owner']
    const roleDescriptions = {
        'user': 'User - No admin access',
        'moderator': 'Moderator - Can view reports and manage basic content',
        'administrator': 'Administrator - Can manage users and workspaces',
        'co-owner': 'Co-Owner - Full access except changing owner role',
        'owner': 'Owner - Full system access'
    }
    
    let message = `Change role for ${username}:\n\nCurrent role: ${currentRole.replace('-', ' ').toUpperCase()}\n\nSelect new role:\n\n`
    roles.forEach((role, index) => {
        message += `${index + 1}. ${roleDescriptions[role]}\n`
    })
    message += '\nEnter number (1-5):'
    
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
        'owner': '#dc3545',        // Red
        'co-owner': '#fd7e14',     // Orange
        'administrator': '#007bff', // Blue
        'moderator': '#17a2b8',    // Cyan
        'user': '#6c757d'          // Gray
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAdminAccess()
    if (isAdmin) {
        const usersTable = document.getElementById('users-table')
        const workspacesTable = document.getElementById('workspaces-table')
        const reportsTable = document.getElementById('reports-table')

        if (usersTable) usersTable.addEventListener('click', handleUserAction)
        if (workspacesTable) workspacesTable.addEventListener('click', handleWorkspaceAction)
        if (reportsTable) reportsTable.addEventListener('click', handleReportAction)

        loadUsers()
        loadWorkspaces()
        loadReports()
    }
})
