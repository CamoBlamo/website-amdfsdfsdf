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
  };

  async function runRoleGuard() {
    const page = document.body && document.body.dataset ? document.body.dataset.page : '';
    const rule = PAGE_RULES[page];
    if (!rule) return;

    try {
      const user = window.getCurrentUser ? window.getCurrentUser() : null;
      if (!user) {
        return;
      }

      const role = window.normalizeGlobalRole
        ? window.normalizeGlobalRole(user.role)
        : String((user && user.role) || 'user').toLowerCase();

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
      // Avoid trapping navigation on unexpected client errors.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runRoleGuard);
    return;
  }

  runRoleGuard();
})();
