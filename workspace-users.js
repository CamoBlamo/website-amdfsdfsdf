// Workspace user management
(function () {
    let csrfToken = '';

    async function fetchCsrfToken() {
        if (csrfToken) return csrfToken;
        const response = await fetch('/csrf-token');
        const data = await response.json();
        csrfToken = data.csrfToken || '';
        return csrfToken;
    }

    function getWorkspaceName() {
        const body = document.body;
        return body && body.dataset ? body.dataset.workspaceName : '';
    }

    function ensureMessageEl() {
        let messageEl = document.getElementById('userAddMessage');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'userAddMessage';
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
        messageEl.style.color = isError ? 'red' : 'green';
    }

    async function loadUsers() {
        const workspaceName = getWorkspaceName();
        if (!workspaceName) return;

        try {
            const response = await fetch(`/workspaces/users?name=${encodeURIComponent(workspaceName)}`);
            const data = await response.json();
            if (!data.success) return;

            const usersList = document.getElementById('usersList');
            const permissionsList = document.getElementById('permissionsList');
            if (!usersList || !permissionsList) return;

            usersList.innerHTML = '';
            permissionsList.innerHTML = '';

            data.users.forEach(user => {
                const userItem = document.createElement('li');
                userItem.textContent = user.email;
                usersList.appendChild(userItem);

                const roleItem = document.createElement('li');
                roleItem.textContent = user.role;
                permissionsList.appendChild(roleItem);
            });
        } catch (error) {
            console.error('Failed to load workspace users', error);
        }
    }

    window.addUsers = async function () {
        const workspaceName = getWorkspaceName();
        const emailInput = document.getElementById('userEmail');
        const roleSelect = document.getElementById('permissionsDropdown');
        if (!workspaceName || !emailInput || !roleSelect) return;

        const email = emailInput.value.trim();
        const role = roleSelect.value;

        if (!email) {
            showMessage('Please enter a user email.', true);
            return;
        }

        try {
            const token = await fetchCsrfToken();
            const response = await fetch('/workspaces/add-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': token
                },
                body: JSON.stringify({
                    workspace_name: workspaceName,
                    email,
                    role
                })
            });

            const data = await response.json();
            if (!data.success) {
                const msg = Array.isArray(data.errors) ? data.errors.join(' ') : 'Failed to add user.';
                showMessage(msg, true);
                return;
            }

            emailInput.value = '';
            showMessage('User added successfully.', false);
            await loadUsers();
        } catch (error) {
            console.error('Failed to add user', error);
            showMessage('Failed to add user.', true);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadUsers();
    });
})();
