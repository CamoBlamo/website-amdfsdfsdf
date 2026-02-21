// Handle workspace creation form submission
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('workspaceForm');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const workspaceName = document.getElementById('workspace_name').value.trim();
            const workspaceDescription = document.getElementById('workspace_description').value.trim();

            // Clear previous messages
            successMessage.style.display = 'none';
            errorMessage.innerHTML = '';
            errorMessage.style.display = 'none';

            try {
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
                errorMessage.style.display = 'block';
            }
        });
    }
});
