document.addEventListener('DOMContentLoaded', async () => {
<<<<<<< HEAD
    // Check if user is authenticated
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

=======
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
    const statusEl = document.getElementById('profileStatus');
    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const subscriptionEl = document.getElementById('profileSubscription');
    const accountTypeEl = document.getElementById('profileAccountType');
    const createdEl = document.getElementById('profileCreated');
    const logoutButton = document.getElementById('logoutButton');

    async function loadProfile() {
        try {
<<<<<<< HEAD
            const res = await fetchWithAuth('/api/me');
            if (!res) return;
            const data = await res.json();

            if (!data.success || !data.user) {
=======
            const res = await fetch('/me', { credentials: 'include' });
            const data = await res.json();

            if (!res.ok || !data.success) {
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
                statusEl.textContent = 'Please log in to view your profile.';
                window.location.href = '/login.html';
                return;
            }

<<<<<<< HEAD
            const user = data.user;

            statusEl.textContent = 'Profile loaded.';
            usernameEl.textContent = user.name || user.username || '-';
            emailEl.textContent = user.email || '-';

            subscriptionEl.textContent = (user.subscriptionStatus || 'free').toUpperCase();

            const providerDisplay = (user.provider || 'Unknown').charAt(0).toUpperCase() + (user.provider || 'unknown').slice(1);
            const role = (user.role || 'user').toLowerCase();
            accountTypeEl.textContent = `${providerDisplay} • ${role}`;

            const adminButton = document.getElementById('admin-panel');
            if (adminButton) {
                const isAdmin = ['owner', 'co-owner', 'administrator', 'moderator'].includes(role);
                adminButton.style.display = isAdmin ? 'inline-block' : 'none';
            }

            if (user.createdAt) {
                const date = new Date(user.createdAt);
=======
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
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
                createdEl.textContent = isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
            } else {
                createdEl.textContent = '-';
            }
<<<<<<< HEAD
=======

            // Show admin panel button only for owner
            if (role === 'owner') {
                const adminButton = document.getElementById('admin-panel');
                if (adminButton) {
                    adminButton.style.display = 'inline-block';
                }
            }
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
        } catch (error) {
            console.error('Failed to load profile', error);
            statusEl.textContent = 'Failed to load profile.';
        }
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
<<<<<<< HEAD
            logout();
            window.location.href = '/login.html';
=======
            window.location.href = '/logout';
>>>>>>> 4db66fd94de433e84d497c57f2de9cc37cff887e
        });
    }

    await loadProfile();
});

