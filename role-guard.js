(function () {
  const PAGE_RULES = {
    'admin-panel': {
      allow: (role) => (window.isAdminRole ? window.isAdminRole(role) : false),
      redirect: '/developerspaces.html',
    },
    'employee-panel': {
      allow: (role) => (window.isEmployeeRole ? window.isEmployeeRole(role) : false),
      redirect: '/developerspaces.html',
    },
    'employee-tickets': {
      allow: (role) => (window.isEmployeeRole ? window.isEmployeeRole(role) : false),
      redirect: '/developerspaces.html',
    },
  };

  async function runRoleGuard() {
    const page = document.body && document.body.dataset ? document.body.dataset.page : '';
    const rule = PAGE_RULES[page];
    if (!rule) return;

    try {
      const response = await fetchWithAuth('/api/me');
      if (!response) return;

      const data = await response.json();
      if (!data || !data.success || !data.user) {
        window.location.href = '/login.html';
        return;
      }

      const role = window.normalizeGlobalRole
        ? window.normalizeGlobalRole(data.user.role)
        : String(data.user.role || 'user').toLowerCase();

      if (window.applyOwnerOnlyVisibility) {
        window.applyOwnerOnlyVisibility(role);
      }
      if (window.applyAdminOnlyVisibility) {
        window.applyAdminOnlyVisibility(role);
      }

      if (!rule.allow(role)) {
        window.location.href = rule.redirect;
      }
    } catch (error) {
      console.error('Role guard error:', error);
      window.location.href = '/login.html';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runRoleGuard);
    return;
  }

  runRoleGuard();
})();
