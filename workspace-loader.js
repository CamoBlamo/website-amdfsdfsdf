// Load user's workspaces and populate the workspace list
document.addEventListener('DOMContentLoaded', async () => {
    const templateContainer = document.querySelector('.template-container');

    // Check if user is owner and show admin panel button
    try {
        const profileResponse = await fetch('/me', { credentials: 'include' });
        const profileData = await profileResponse.json();
        
        if (profileData.success && profileData.user.role === 'owner') {
            const adminLink = document.getElementById('admin-link');
            if (adminLink) {
                adminLink.style.display = 'inline-block';
            }
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
    }

    try {
        const response = await fetch('/get_user_workspaces', { credentials: 'include' });
        const data = await response.json();

        if (data.success && data.workspaces.length > 0) {
            // Clear the template container
            templateContainer.innerHTML = '';

            // Create a template card for each workspace
            data.workspaces.forEach(workspace => {
                const template = document.createElement('div');
                template.className = 'template';
                template.innerHTML = `
                    <h6>${escapeHtml(workspace.name)}</h6>
                    <p>${escapeHtml(workspace.description || 'No description provided')}</p>
                    <button class="select-workspace-btn" data-workspace-file="${escapeHtml(workspace.html_file)}">Select Workspace</button>
                `;

                // Add event listener to the select button
                const selectBtn = template.querySelector('.select-workspace-btn');
                selectBtn.addEventListener('click', () => {
                    const normalizedPath = workspace.html_file.startsWith('workspaces/')
                        ? workspace.html_file
                        : `workspaces/${workspace.html_file}`;
                    window.location.href = `/${normalizedPath}`;
                });

                templateContainer.appendChild(template);
            });
        } else {
            // Show message if no workspaces
            templateContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No workspaces yet. Create one to get started!</p>';
        }
    } catch (error) {
        console.error('Error loading workspaces:', error);
        templateContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Error loading workspaces. Please refresh the page.</p>';
    }

    // Handle create workspace button
    const createBtn = document.getElementById('create-workspace-button');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            window.location.href = 'workspacecreate.html';
        });
    }
});

// Helper function to escape HTML special characters
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
