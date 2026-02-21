document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('profileStatus');
    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const subscriptionEl = document.getElementById('profileSubscription');
    const accountTypeEl = document.getElementById('profileAccountType');
    const createdEl = document.getElementById('profileCreated');
    const logoutButton = document.getElementById('logoutButton');

    async function loadProfile() {
        try {
            const res = await fetch('/me', { credentials: 'include' });
            const data = await res.json();

            if (!res.ok || !data.success) {
                statusEl.textContent = 'Please log in to view your profile.';
                window.location.href = '/login.html';
                return;
            }

            statusEl.textContent = 'Profile loaded.';
            usernameEl.textContent = data.user.username || '-';
            emailEl.textContent = data.user.email || '-';
            subscriptionEl.textContent = (data.user.subscription_status || 'none').toUpperCase();
            
            // Display role with proper formatting
            const role = data.user.role || 'user';
            const roleDisplay = role.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
            accountTypeEl.textContent = roleDisplay;
            
            if (data.user.created_at) {
                const date = new Date(data.user.created_at);
                createdEl.textContent = isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
            } else {
                createdEl.textContent = '-';
            }

            // Show admin panel button only for owner
            if (role === 'owner') {
                const adminButton = document.getElementById('admin-panel');
                if (adminButton) {
                    adminButton.style.display = 'inline-block';
                }
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
