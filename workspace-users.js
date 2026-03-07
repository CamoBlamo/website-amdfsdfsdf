// Workspace user management

function normalizeWorkspaceRoleValue(role) {
    if (window.normalizeWorkspaceRole) {
        return window.normalizeWorkspaceRole(role);
    }

    const normalized = String(role || '').toLowerCase();
    if (normalized === 'admin') return 'workspace-admin';
    if (['workspace-admin', 'head-developer', 'developer', 'viewer'].includes(normalized)) {
        return normalized;
    }
    return 'developer';
}

function canManageWorkspaceUsers(requesterRole, requesterGlobalRole) {
    const globalRole = window.normalizeGlobalRole
        ? window.normalizeGlobalRole(requesterGlobalRole)
        : String(requesterGlobalRole || 'user').toLowerCase();

    const isOwner = window.isOwnerRole
        ? window.isOwnerRole(globalRole)
        : globalRole === 'owner';
    if (isOwner) return true;

    if (window.isWorkspaceAdminRole) {
        return window.isWorkspaceAdminRole(requesterRole);
    }

    const normalizedRole = String(requesterRole || '').toLowerCase();
    return ['admin', 'workspace-admin', 'head-developer'].includes(normalizedRole);
}

function getRoleCandidatesForAssignment(selectedRole) {
    const normalized = normalizeWorkspaceRoleValue(selectedRole);
    if (normalized === 'workspace-admin') {
        return ['workspace-admin', 'admin'];
    }
    return [normalized];
}

function getWorkspaceUsersName() {
    const body = document.body;
    const wsName = body && body.dataset ? body.dataset.workspaceName : '';
    console.log('Workspace Name:', wsName);
    return wsName;
}

function ensureMessageEl() {
    let messageEl = document.getElementById('userAddMessage');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'userAddMessage';
        messageEl.style.padding = '1em';
        messageEl.style.marginTop = '1em';
        messageEl.style.borderRadius = '8px';
        messageEl.style.fontSize = '0.95em';
        const usersBlock = document.querySelector('.users');
        if (usersBlock) {
            usersBlock.appendChild(messageEl);
        }
    }
    return messageEl;
}

function showMessage(text, isError) {
    const messageEl = ensureMessageEl();
    messageEl.textContent = text;
    messageEl.style.color = isError ? '#ff6b6b' : '#51cf66';
    messageEl.style.backgroundColor = isError ? 'rgba(255, 107, 107, 0.1)' : 'rgba(81, 207, 102, 0.1)';
    messageEl.style.border = isError ? '1px solid #ff6b6b' : '1px solid #51cf66';
}

async function loadUsers() {
    const workspaceName = getWorkspaceUsersName();
    console.log('Loading users for workspace:', workspaceName);
    if (!workspaceName) {
        console.error('No workspace name found');
        return;
    }

    try {
        const response = await fetch(`/workspaces/users?name=${encodeURIComponent(workspaceName)}`, { credentials: 'include' });
        const data = await response.json();
        console.log('Users API response:', data);
        if (!data.success) {
            showMessage(Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to load users', true);
            return;
        }

        const usersList = document.getElementById('usersList');
        const permissionsList = document.getElementById('permissionsList');
        if (!usersList || !permissionsList) {
            console.error('Users or permissions list elements not found');
            return;
        }

        usersList.innerHTML = '';
        permissionsList.innerHTML = '';

        if (!data.users || data.users.length === 0) {
            usersList.innerHTML = '<li style="color: #a8b3bb;">No users in workspace yet</li>';
        } else {
            data.users.forEach(user => {
                const userItem = document.createElement('li');
                userItem.textContent = user.username ? `${user.username} (${user.email})` : user.email;
                usersList.appendChild(userItem);

                const roleItem = document.createElement('li');
                roleItem.textContent = user.role;
                permissionsList.appendChild(roleItem);
            });
        }

        const requesterRole = data.requesterRole || '';
        const requesterGlobalRole = data.requesterGlobalRole || 'user';
    const canManage = canManageWorkspaceUsers(requesterRole, requesterGlobalRole);
        console.log('Can manage users:', canManage, '(requesterRole:', requesterRole, ', requesterGlobalRole:', requesterGlobalRole, ')');
        
        const addButton = document.getElementById('addUsers');
        const emailInput = document.getElementById('userEmail');
        const roleSelect = document.getElementById('permissionsDropdown');

        if (addButton) addButton.disabled = !canManage;
        if (emailInput) emailInput.disabled = !canManage;
        if (roleSelect) roleSelect.disabled = !canManage;

        if (!canManage) {
            showMessage('Only workspace admins or the owner can add users.', true);
        } else {
            showMessage('Ready to add users', false);
        }
    } catch (error) {
        console.error('Failed to load workspace users', error);
        showMessage('Error loading users: ' + error.message, true);
    }
}

async function addUsers() {
    console.log('addUsers() called - START');
    try {
        const workspaceName = getWorkspaceUsersName();
        console.log('1. Workspace name:', workspaceName);
        
        const emailInput = document.getElementById('userEmail');
        const roleSelect = document.getElementById('permissionsDropdown');
        console.log('2. Email input:', emailInput ? 'FOUND' : 'NOT FOUND');
        console.log('3. Role select:', roleSelect ? 'FOUND' : 'NOT FOUND');
        
        if (!workspaceName || !emailInput || !roleSelect) {
            console.error('Missing required elements - cannot proceed');
            showMessage('Missing form elements', true);
            return;
        }

        const email = emailInput.value.trim();
    const selectedRole = roleSelect.value;
    const roleCandidates = getRoleCandidatesForAssignment(selectedRole);
        console.log('4. Email:', email);
    console.log('5. Role candidates:', roleCandidates);

        if (!email) {
            console.warn('No email provided');
            showMessage('Please enter a user email.', true);
            return;
        }

        let data = null;
        let errorMsg = '';

        for (const role of roleCandidates) {
            console.log('6. Making fetch request to /workspaces/add-user with role:', role);
            const response = await fetch('/workspaces/add-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    workspace_name: workspaceName,
                    email,
                    role
                })
            });

            console.log('7. Response received - status:', response.status);
            data = await response.json();
            console.log('8. Response data:', data);

            if (data.success) {
                break;
            }

            errorMsg = Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to add user.';
            const roleRejected = /invalid role|role/i.test(errorMsg);
            if (!(role === 'workspace-admin' && roleRejected)) {
                break;
            }
        }
        
        if (!data || !data.success) {
            console.error('Error from server:', errorMsg || 'Failed to add user.');
            showMessage(errorMsg || 'Failed to add user.', true);
            return;
        }

        emailInput.value = '';
        roleSelect.value = 'developer';
        console.log('9. User added successfully');
        showMessage('✓ User added successfully.', false);
        setTimeout(() => {
            loadUsers();
        }, 500);
    } catch (error) {
        console.error('EXCEPTION in addUsers:', error);
        console.error('Stack:', error.stack);
        showMessage('Error adding user: ' + error.message, true);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log('Initializing workspace users module');
        loadUsers();
        
        // Ensure addUsers is accessible globally and add fallback event listener
        window.addUsers = window.addUsers || addUsers;
        const addUsersBtn = document.getElementById('addUsers');
        if (addUsersBtn) {
            console.log('Found addUsers button, adding event listener as fallback');
            addUsersBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('Button clicked via event listener');
                await addUsers();
            });
        } else {
            console.warn('addUsers button not found!');
        }
    }, 100);
});

