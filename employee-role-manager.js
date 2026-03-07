document.addEventListener('DOMContentLoaded', async () => {
    const manager = document.getElementById('employeeRoleManager')
    const statusEl = document.getElementById('employeeRoleManagerStatus')
    const tableBody = document.querySelector('#employeeRolesTable tbody')

    if (!manager || !statusEl || !tableBody) return

    const manageableRoles = ['owner', 'co-owner', 'administrator']
    const roleOptions = ['user', 'moderator', 'administrator', 'co-owner', 'owner']

    function normalizeRole(role) {
        return window.normalizeGlobalRole
            ? window.normalizeGlobalRole(role)
            : String(role || 'user').toLowerCase()
    }

    function formatRole(role) {
        const normalized = normalizeRole(role)
        return normalized.replace('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    }

    function escapeHtml(value) {
        const div = document.createElement('div')
        div.textContent = value == null ? '' : String(value)
        return div.innerHTML
    }

    function setStatus(message, type = 'info') {
        statusEl.textContent = message
        if (type === 'error') {
            statusEl.style.color = '#ff4d4d'
            return
        }
        if (type === 'success') {
            statusEl.style.color = '#4dff4d'
            return
        }
        statusEl.style.color = '#a8b3bb'
    }

    async function updateUserRole(userId, nextRole, button, select) {
        button.disabled = true
        select.disabled = true

        try {
            const response = await fetchWithAuth('/api/admin?section=users', {
                method: 'PATCH',
                body: JSON.stringify({ userId, action: 'role', value: nextRole })
            })

            if (!response) {
                setStatus('Session expired. Please sign in again.', 'error')
                return
            }

            const data = await response.json()
            if (!data.success) {
                const message = Array.isArray(data.errors) ? data.errors.join(', ') : 'Failed to update role.'
                setStatus(message, 'error')
                return
            }

            setStatus('Role updated successfully.', 'success')
            await loadUsers()
        } catch (error) {
            console.error('Role update error:', error)
            setStatus('Network error while updating role.', 'error')
        } finally {
            button.disabled = false
            select.disabled = false
        }
    }

    function renderUsers(users) {
        tableBody.innerHTML = ''

        users.forEach((user) => {
            const currentRole = normalizeRole(user.role || 'user')
            const row = document.createElement('tr')

            const displayName = user.username || user.name || user.email || 'Unknown'
            row.innerHTML = `
                <td>${escapeHtml(displayName)}</td>
                <td>${escapeHtml(user.email || '-')}</td>
                <td>${escapeHtml(formatRole(currentRole))}</td>
                <td></td>
                <td></td>
            `

            const roleCell = row.children[3]
            const actionCell = row.children[4]

            const select = document.createElement('select')
            roleOptions.forEach((role) => {
                const option = document.createElement('option')
                option.value = role
                option.textContent = formatRole(role)
                option.selected = role === currentRole
                select.appendChild(option)
            })
            roleCell.appendChild(select)

            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'btn-change-role'
            button.textContent = 'Save'
            button.addEventListener('click', async () => {
                const nextRole = normalizeRole(select.value)
                if (nextRole === currentRole) {
                    setStatus('No changes to save.', 'info')
                    return
                }
                await updateUserRole(user.id, nextRole, button, select)
            })
            actionCell.appendChild(button)

            tableBody.appendChild(row)
        })
    }

    async function loadUsers() {
        const response = await fetchWithAuth('/api/admin?section=users')
        if (!response) {
            setStatus('Session expired. Please sign in again.', 'error')
            return
        }

        const data = await response.json()
        if (!data.success || !Array.isArray(data.users)) {
            const message = Array.isArray(data.errors) ? data.errors.join(', ') : 'Failed to load users.'
            setStatus(message, 'error')
            return
        }

        if (data.users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No users found.</td></tr>'
            setStatus('No users available.', 'info')
            return
        }

        renderUsers(data.users)
        setStatus('Manage employee roles below.', 'info')
    }

    try {
        const meResponse = await fetchWithAuth('/api/me')
        if (!meResponse) {
            setStatus('Session expired. Please sign in again.', 'error')
            return
        }

        const me = await meResponse.json()
        if (!me.success || !me.user) {
            setStatus('Unable to verify permissions.', 'error')
            return
        }

        const role = normalizeRole(me.user.role)
        if (window.applyOwnerOnlyVisibility) {
            window.applyOwnerOnlyVisibility(role)
        }
        if (window.applyAdminOnlyVisibility) {
            window.applyAdminOnlyVisibility(role)
        }

        if (!manageableRoles.includes(role)) {
            return
        }

        manager.style.display = 'block'
        setStatus('Loading users...', 'info')
        await loadUsers()
    } catch (error) {
        console.error('Employee role manager init error:', error)
        setStatus('Unable to initialize role manager.', 'error')
    }
})
