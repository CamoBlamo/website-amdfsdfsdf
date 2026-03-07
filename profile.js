document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    const statusEl = document.getElementById('profileStatus');
    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const subscriptionEl = document.getElementById('profileSubscription');
    const accountTypeEl = document.getElementById('profileAccountType');
    const createdEl = document.getElementById('profileCreated');
    const logoutButton = document.getElementById('logoutButton');

    async function loadProfile() {
        try {
            const res = await fetchWithAuth('/api/me');
            if (!res) return;
            const data = await res.json();

            if (!data.success || !data.user) {
                statusEl.textContent = 'Please log in to view your profile.';
                window.location.href = '/login.html';
                return;
            }

            const user = data.user;

            statusEl.textContent = 'Profile loaded.';
            usernameEl.textContent = user.name || user.username || '-';
            emailEl.textContent = user.email || '-';

            subscriptionEl.textContent = (user.subscriptionStatus || 'free').toUpperCase();

            const providerDisplay = (user.provider || 'Unknown').charAt(0).toUpperCase() + (user.provider || 'unknown').slice(1);
            const role = window.normalizeGlobalRole
                ? window.normalizeGlobalRole(user.role)
                : String(user.role || 'user').toLowerCase();
            accountTypeEl.textContent = `${providerDisplay} • ${role}`;

            if (window.applyOwnerOnlyVisibility) {
                window.applyOwnerOnlyVisibility(role);
            }

            const adminButton = document.getElementById('admin-panel');
            if (adminButton) {
                const isAdmin = window.isAdminRole
                    ? window.isAdminRole(role)
                    : ['owner', 'co-owner', 'administrator', 'moderator'].includes(role);
                adminButton.style.display = isAdmin ? 'inline-block' : 'none';
            }

            if (user.createdAt) {
                const date = new Date(user.createdAt);
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
            logout();
            window.location.href = '/login.html';
        });
    }

    await loadProfile();
});

