// Load user's workspaces and populate the workspace list
document.addEventListener('DOMContentLoaded', async () => {
    const templateContainer = document.querySelector('.template-container');
    const currentPage = document.body && document.body.dataset ? document.body.dataset.page : '';
    const isEmployeePage = currentPage === 'employee-panel' || currentPage === 'employee-tickets';
    const isEmployeePanel = currentPage === 'employee-panel';
    const isEmployeeTickets = currentPage === 'employee-tickets';
    const isSupportMessages = currentPage === 'support-messages';

    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    try {
        // Get current user info
        const user = getCurrentUser();
        if (user) {
            const displayName = user.name || user.username || user.email;
            // Update the logo/welcome text if you want
            const logo = document.querySelector('.logo h1');
            if (logo && displayName) {
                if (isEmployeePanel) {
                    logo.textContent = `Employee Hub — ${displayName}`;
                } else if (isEmployeeTickets) {
                    logo.textContent = `Support Desk — ${displayName}`;
                } else if (isSupportMessages) {
                    logo.textContent = `Customer Support — ${displayName}`;
                } else {
                    logo.textContent = `Welcome, ${displayName}`;
                }
            }
        }

        // Check admin role via API for accurate role
        const adminLink = document.getElementById('admin-link');
        if (adminLink) {
            const meRes = await fetchWithAuth('/api/me');
            if (meRes) {
                const me = await meRes.json();
                const role = window.normalizeGlobalRole
                    ? window.normalizeGlobalRole(me.user && me.user.role)
                    : ((me.user && me.user.role) ? String(me.user.role).toLowerCase() : 'user');
                const isAdmin = window.isAdminRole
                    ? window.isAdminRole(role)
                    : ['owner', 'co-owner', 'administrator', 'moderator'].includes(role);
                const isEmployee = window.isEmployeeRole
                    ? window.isEmployeeRole(role)
                    : ['staff', 'moderator', 'administrator', 'co-owner', 'owner'].includes(role);

                if (isEmployeePage && !isEmployee) {
                    window.location.href = '/developerspaces.html';
                    return;
                }

                adminLink.style.display = isAdmin ? '' : 'none';

                if (window.applyOwnerOnlyVisibility) {
                    window.applyOwnerOnlyVisibility(role);
                }

                if (window.applyAdminOnlyVisibility) {
                    window.applyAdminOnlyVisibility(role);
                }

                const ownerSessionLabel = document.querySelector('[data-owner-session-label]');
                const isOwner = window.isOwnerRole ? window.isOwnerRole(role) : role === 'owner';
                if (ownerSessionLabel) {
                    ownerSessionLabel.textContent = isOwner
                        ? 'DevDock leadership + staff session active'
                        : 'DevDock staff session active';
                }

                if (isEmployeePanel) {
                    const sessionCopy = document.querySelector('.session-copy');
                    if (sessionCopy) {
                        sessionCopy.textContent = isAdmin
                            ? 'Internal DevDock operations tools are active. Manage workspace delivery and team access based on your role.'
                            : 'Internal DevDock staff tools are active. Open assigned workspaces and support delivery tasks from this hub.';
                    }
                } else if (isEmployeeTickets) {
                    const sessionCopy = document.querySelector('.session-copy');
                    if (sessionCopy) {
                        sessionCopy.textContent = isAdmin
                            ? 'Dedicated support workflow is active. Manage queue ownership, replies, and resolution from this desk.'
                            : 'Dedicated support workflow is active. Triage tickets, claim ownership, and respond from one focused view.';
                    }
                } else if (isSupportMessages) {
                    const sessionCopy = document.querySelector('.session-copy');
                    if (sessionCopy) {
                        sessionCopy.textContent = 'Customer support workflow is active. Start a conversation, track replies, and manage your messages from this page.';
                    }
                }
            }
        }

        if (templateContainer) {
            // Fetch workspaces from API
            const response = await fetchWithAuth('/api/workspaces');
            if (!response) {
                handleError('Failed to fetch workspaces');
                return;
            }

            const data = await response.json();
            const workspaces = data.workspaces || [];

            if (workspaces && workspaces.length > 0) {
                // Clear the template container
                templateContainer.innerHTML = '';

                // Create a template card for each workspace
                workspaces.forEach(workspace => {
                    const template = document.createElement('div');
                    template.className = 'template';
                    template.innerHTML = `
                    <h6>${escapeHtml(workspace.name)}</h6>
                    <p>${escapeHtml(workspace.description || 'No description provided')}</p>
                    <p class="workspace-date">Created: ${new Date(workspace.createdAt).toLocaleDateString()}</p>
                    <button class="select-workspace-btn" data-workspace-id="${escapeHtml(workspace.id)}">Open Workspace</button>
                `;

                    // Add event listener to the select button
                    const selectBtn = template.querySelector('.select-workspace-btn');
                    selectBtn.addEventListener('click', () => {
                        // For now, redirect to a workspace page (you can customize this)
                        window.location.href = `/workspace.html?id=${workspace.id}`;
                    });

                    templateContainer.appendChild(template);
                });
            } else {
                // Show message if no workspaces
                templateContainer.innerHTML = isEmployeePage
                    ? '<p style="grid-column: 1/-1; text-align: center;">No internal workspace assignments yet. Ask a DevDock administrator to grant access.</p>'
                    : '<p style="grid-column: 1/-1; text-align: center;">No workspaces yet. Create one to get started!</p>';
            }
        }
    } catch (error) {
        console.error('Error loading workspaces:', error);
        
        // Check if it's an auth error
        if (error.message && error.message.includes('Unauthorized')) {
            window.location.href = '/login.html';
            return;
        }
        
        if (templateContainer) {
            templateContainer.innerHTML = isEmployeePage
                ? '<p style="grid-column: 1/-1; text-align: center; color: red;">Error loading internal workspace assignments. Please refresh the page.</p>'
                : '<p style="grid-column: 1/-1; text-align: center; color: red;">Error loading workspaces. Please refresh the page.</p>';
        }
    }

    // Handle create workspace button
    const createBtn = document.getElementById('create-workspace-button');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            window.location.href = 'workspacecreate.html';
        });
    }

    // Add logout functionality
    const profileLink = document.getElementById('profile-link');
    const existingLogoutLink = document.getElementById('logout-link');
    if (profileLink && !existingLogoutLink && profileLink.parentNode) {
        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.id = 'logout-link';
        logoutLink.className = profileLink.className || 'sidebar-item';
        logoutLink.innerHTML = '<span class="sidebar-icon">↩</span><span>Log Out</span>';
        logoutLink.addEventListener('click', (event) => {
            event.preventDefault();
            logout();
        });

        profileLink.parentNode.insertBefore(logoutLink, profileLink.nextSibling);
    }
});

// Helper function to escape HTML special characters
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

