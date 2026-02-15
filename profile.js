document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('profileStatus');
    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const createdEl = document.getElementById('profileCreated');
    const logoutButton = document.getElementById('logoutButton');

    async function loadProfile() {
        try {
            const res = await fetch('/me');
            const data = await res.json();

            if (!res.ok || !data.success) {
                statusEl.textContent = 'Please log in to view your profile.';
                window.location.href = '/login.html';
                return;
            }

            statusEl.textContent = 'Profile loaded.';
            usernameEl.textContent = data.user.username || '-';
            emailEl.textContent = data.user.email || '-';
            if (data.user.created_at) {
                const date = new Date(data.user.created_at);
                createdEl.textContent = isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
            } else {
                createdEl.textContent = '-';
            }
        } catch (error) {
            console.error('Failed to load profile', error);
            statusEl.textContent = 'Failed to load profile.';
        }
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            window.location.href = '/logout';
        });
    }

    await loadProfile();
});
