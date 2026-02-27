// Handle workspace creation form submission
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    const form = document.getElementById('workspaceForm');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const workspaceName = document.getElementById('workspace_name').value.trim();
            const workspaceDescription = document.getElementById('workspace_description').value.trim();

            // Validate input
            if (!workspaceName) {
                errorMessage.innerHTML = 'Workspace name is required';
                errorMessage.style.display = 'block';
                return;
            }

            // Clear previous messages
            successMessage.style.display = 'none';
            errorMessage.innerHTML = '';
            errorMessage.style.display = 'none';

            try {
                // Use the createWorkspace function from auth-client.js
                const workspace = await createWorkspace(workspaceName, workspaceDescription);

                // Show success message
                successMessage.style.display = 'block';
                
                // Redirect to workspaces page after 1.5 seconds
                setTimeout(() => {
                    window.location.href = '/developerspaces.html';
                }, 1500);
            } catch (error) {
                console.error('Error creating workspace:', error);
                
                // Check if it's an auth error
                if (error.message && error.message.includes('Unauthorized')) {
                    window.location.href = '/login.html';
                    return;
                }
                
                errorMessage.innerHTML = error.message || 'An error occurred while creating the workspace';
                errorMessage.style.display = 'block';
            }
        });
    }
});

