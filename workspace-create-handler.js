// Handle workspace creation form submission
document.addEventListener('DOMContentLoaded', () => {
<<<<<<< HEAD
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

=======
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
    const form = document.getElementById('workspaceForm');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const workspaceName = document.getElementById('workspace_name').value.trim();
            const workspaceDescription = document.getElementById('workspace_description').value.trim();

<<<<<<< HEAD
            // Validate input
            if (!workspaceName) {
                errorMessage.innerHTML = 'Workspace name is required';
                errorMessage.style.display = 'block';
                return;
            }

=======
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
            // Clear previous messages
            successMessage.style.display = 'none';
            errorMessage.innerHTML = '';
            errorMessage.style.display = 'none';

            try {
<<<<<<< HEAD
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
=======
                const response = await fetch('/create_workspace', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        workspace_name: workspaceName,
                        workspace_description: workspaceDescription
                    })
                });

                const data = await response.json();

                if (data.success) {
                    successMessage.style.display = 'block';
                    // Redirect to the newly created workspace after 1.5 seconds
                    setTimeout(() => {
                        window.location.href = data.workspaceUrl;
                    }, 1500);
                } else {
                    errorMessage.innerHTML = (data.errors && Array.isArray(data.errors) ? data.errors.join('<br>') : 'Failed to create workspace');
                    errorMessage.style.display = 'block';
                }
            } catch (error) {
                console.error('Error creating workspace:', error);
                errorMessage.innerHTML = 'An error occurred while creating the workspace';
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
                errorMessage.style.display = 'block';
            }
        });
    }
});
