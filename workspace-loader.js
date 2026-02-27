// Load user's workspaces and populate the workspace list
document.addEventListener('DOMContentLoaded', async () => {
    const templateContainer = document.querySelector('.template-container');

    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    try {
        // Get current user info
        const user = getCurrentUser();
        if (user && user.name) {
            // Update the logo/welcome text if you want
            const logo = document.querySelector('.logo h1');
            if (logo) {
                logo.textContent = `Welcome, ${user.name}`;
            }
        }

        // Check admin role via API for accurate role
        const adminLink = document.getElementById('admin-link');
        if (adminLink) {
            const meRes = await fetchWithAuth('/api/me');
            if (meRes) {
                const me = await meRes.json();
                const role = (me.user && me.user.role) ? String(me.user.role).toLowerCase() : 'user';
                const isAdmin = ['owner', 'co-owner', 'administrator', 'moderator'].includes(role);
                adminLink.style.display = isAdmin ? 'inline-block' : 'none';
            }
        }

        // Fetch workspaces from API
        const workspaces = await getWorkspaces();

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
            templateContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No workspaces yet. Create one to get started!</p>';
        }
    } catch (error) {
        console.error('Error loading workspaces:', error);
        
        // Check if it's an auth error
        if (error.message && error.message.includes('Unauthorized')) {
            window.location.href = '/login.html';
            return;
        }
        
        templateContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Error loading workspaces. Please refresh the page.</p>';
    }

    // Handle create workspace button
    const createBtn = document.getElementById('create-workspace-button');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            window.location.href = 'workspacecreate.html';
        });
    }

    // Add logout functionality
    const profileBtn = document.getElementById('profile');
    if (profileBtn) {
        // Create logout button
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logout-btn';
        logoutBtn.innerHTML = '<span class="logout-text">Logout</span>';
        logoutBtn.addEventListener('click', () => {
            logout();
            window.location.href = '/login.html';
        });
        
        // Insert after profile button
        const profileLink = document.getElementById('profile-link');
        if (profileLink && profileLink.parentNode) {
            const logoutLink = document.createElement('a');
            logoutLink.href = '#';
            logoutLink.id = 'logout-link';
            logoutLink.appendChild(logoutBtn);
            profileLink.parentNode.insertBefore(logoutLink, profileLink.nextSibling);
        }
    }
});

// Helper function to escape HTML special characters
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
