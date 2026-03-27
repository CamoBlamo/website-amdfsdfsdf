(function () {
  const INFO_ITEMS = [
    { href: '/info-pages/company.html', label: 'Company' },
    { href: '/info-pages/contact.html', label: 'Contact' },
    { href: '/info-pages/testimonies.html', label: 'Testimonies' },
    { href: '/info-pages/staff-team.html', label: 'Staff Team' },
  ];

  const PUBLIC_ITEMS = [
    { href: '/application-info.html', label: 'Application Info' },
    { href: '/index.html', label: 'Dashboard' },
    { href: '/signin-pages/signin.html', label: 'Sign In', authLink: true },
    ...INFO_ITEMS,
  ];

  const APPLY_ITEMS = [
    {
      title: null,
      items: [
        { href: '/index.html', label: 'Dashboard' },
        { href: '/signin-pages/signin.html', label: 'Sign In', authLink: true },
      ],
    },
    {
      title: 'Company',
      items: [
        { href: '/about-us.html', label: 'About Us' },
        { href: '/pricing.html', label: 'Pricing' },
      ],
    },
    {
      title: 'Opportunities',
      items: [
        { href: '/apply-beta-tester.html', label: 'Beta Tester' },
        { href: '/apply-customer-support.html', label: 'Customer Support' },
        { href: '/apply-public-relations.html', label: 'Public Relations' },
        { href: '/application-info.html', label: 'Application Info' },
      ],
    },
  ];

  const APP_GROUPS = [
    {
      title: 'Home Base',
      items: [
        { href: '/developerspaces.html', label: 'Dashboard' },
        { href: '/workspaces.html', label: 'Workspaces' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { href: '/application-info.html', label: 'Application Info' },
        { href: '/workspacecreate.html', label: 'Create Workspace' },
        { href: '/pricing.html', label: 'Pricing' },
        { href: '/employee-panel.html', label: 'Employee Panel', dataAttr: 'data-employee-only', hidden: true },
        { href: '/admin-panel.html', label: 'Admin Console', id: 'admin-link', dataAttr: 'data-admin-only', hidden: true },
      ],
    },
    {
      title: 'Account',
      items: [
        { href: '/profile.html', label: 'My Profile', id: 'profile-link' },
        { href: '/settings.html', label: 'Settings', id: 'settings-link-top' },
      ],
    },
    {
      title: 'Reference',
      items: INFO_ITEMS,
    },
  ];

  const EMPLOYEE_GROUPS = [
    {
      title: 'Daily Work',
      items: [
        { href: '/employee-panel.html', label: 'Employee Hub' },
        { href: '/employee-tickets.html', label: 'Support Desk' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { href: '/application-info.html', label: 'Application Info' },
        { href: '/workspacecreate.html', label: 'Workspace Setup', dataAttr: 'data-admin-only', hidden: true },
        { href: '/developerspaces.html', label: 'Owner Dashboard', dataAttr: 'data-owner-only', hidden: true },
        { href: '/pricing.html', label: 'Owner Billing', id: 'upgrade-link', dataAttr: 'data-owner-only', hidden: true },
        { href: '/admin-panel.html', label: 'Admin Console', id: 'admin-link', dataAttr: 'data-admin-only', hidden: true },
      ],
    },
    {
      title: 'Account',
      items: [
        { href: '/employee-profile.html', label: 'My Profile', id: 'profile-link' },
        { href: '/employee-settings.html', label: 'Settings', id: 'settings-link-top' },
      ],
    },
    {
      title: 'Reference',
      items: [
        { href: '/info-pages/staff-team.html', label: 'Staff Team' },
        { href: '/info-pages/company.html', label: 'Company' },
        { href: '/info-pages/contact.html', label: 'Contact' },
        { href: '/info-pages/testimonies.html', label: 'Testimonies' },
      ],
    },
  ];

  const LEGAL_ITEMS = [
    { href: '/index.html', label: 'Dashboard' },
    { href: 'https://statuspage.incident.io/devdock', label: 'Status', external: true },
    { href: '/privacy-policy.html', label: 'Privacy Policy' },
    { href: '/terms-of-service.html', label: 'Terms of Service' },
    { href: '/info-pages/contact.html', label: 'Contact' },
  ];

  const STATUS_ITEMS = [
    { href: '/', label: 'Home' },
    { href: '/pricing.html', label: 'Pricing' },
    { href: '/team.html', label: 'Team' },
    { href: 'https://statuspage.incident.io/devdock', label: 'Status', external: true },
    ...INFO_ITEMS,
  ];

  function normalizePath(value) {
    try {
      const url = new URL(value, window.location.origin);
      const pathname = url.pathname || '/';
      if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
      }
      return pathname;
    } catch (_) {
      return String(value || '');
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentPath() {
    const path = normalizePath(window.location.pathname || '/');
    return path === '' ? '/' : path;
  }

  function authPaths() {
    return new Set(['/signin-pages/signin.html', '/login.html']);
  }

  function isCurrent(itemHref, path) {
    if (!itemHref) return false;
    if (itemHref.startsWith('http://') || itemHref.startsWith('https://')) {
      return itemHref === 'https://statuspage.incident.io/devdock' && path === '/status.html';
    }

    const normalizedHref = normalizePath(itemHref);
    if (normalizedHref === '/index.html') {
      return path === '/' || path === '/index.html';
    }

    if (authPaths().has(normalizedHref)) {
      return authPaths().has(path);
    }

    return normalizedHref === path;
  }

  function withPageSpecificAttrs(item, path, variantName) {
    const next = { ...item };

    if (item.authLink && (path === '/' || path === '/index.html')) {
      next.id = 'index-sidebar-auth-link';
      next.labelId = 'index-sidebar-auth-label';
    }

    if (item.href === '/admin-panel.html' && (path === '/profile.html' || path === '/employee-profile.html')) {
      next.id = 'admin-panel';
    }

    if (item.href === '/developerspaces.html' && path === '/pricing.html') {
      next.id = 'back-link';
    }

    if (item.href === '/profile.html' && variantName === 'app') {
      next.id = 'profile-link';
    }

    if (item.href === '/employee-profile.html' && variantName === 'employee') {
      next.id = 'profile-link';
    }

    return next;
  }

  function renderItem(item, path, variantName) {
    const resolved = withPageSpecificAttrs(item, path, variantName);
    const classes = ['sidebar-item'];
    if (isCurrent(resolved.href, path)) {
      classes.push('active');
    }

    const attrs = [`class="${classes.join(' ')}"`];
    if (resolved.id) attrs.push(`id="${escapeHtml(resolved.id)}"`);
    if (resolved.dataAttr) attrs.push(resolved.dataAttr);
    if (resolved.hidden) attrs.push('style="display:none;"');

    if (resolved.href) {
      attrs.push(`href="${escapeHtml(resolved.href)}"`);
      if (resolved.external) {
        attrs.push('target="_blank"');
        attrs.push('rel="noopener"');
      }
      const label = resolved.labelId
        ? `<span id="${escapeHtml(resolved.labelId)}">${escapeHtml(resolved.label)}</span>`
        : `<span>${escapeHtml(resolved.label)}</span>`;
      return `<a ${attrs.join(' ')}><span class="sidebar-icon">•</span>${label}</a>`;
    }

    return `<button ${attrs.join(' ')} type="button"><span class="sidebar-icon">•</span><span>${escapeHtml(resolved.label)}</span><span style="margin-left:auto">⌄</span></button>`;
  }

  function renderGroups(groups, path, variantName) {
    return groups.map((group) => {
      const title = group.title ? `<p class="sidebar-group-title">${escapeHtml(group.title)}</p>` : '';
      const items = group.items.map((item) => renderItem(item, path, variantName)).join('');
      return `<div class="sidebar-section">${title}${items}</div>`;
    }).join('');
  }

  function renderFooter(variant) {
    if (!variant.footer) return '';

    if (variant.footer.type === 'sections') {
      return `<div class="sidebar-sections">${renderItem({ label: 'Sections' }, currentPath(), variant.name)}</div>`;
    }

    if (variant.footer.type === 'meta') {
      return `
        <div class="sidebar-sections">
          <div class="sidebar-meta">
            <strong>${escapeHtml(variant.footer.title)}</strong>
            ${escapeHtml(variant.footer.text)}
          </div>
        </div>`;
    }

    return '';
  }

  function resolveVariant(path) {
    const applySet = new Set(['/apply-beta-tester.html', '/apply-customer-support.html', '/apply-public-relations.html', '/application-info.html']);
    const appSet = new Set(['/developerspaces.html', '/workspaces.html', '/workspacecreate.html', '/pricing.html', '/profile.html', '/settings.html', '/admin-panel.html', '/workspace-template.html']);
    const employeeSet = new Set(['/employee-panel.html', '/employee-profile.html', '/employee-settings.html', '/employee-tickets.html']);
    const legalSet = new Set(['/privacy-policy.html', '/terms-of-service.html']);

    if (path === '/status.html') {
      return { name: 'status', groups: [{ title: null, items: STATUS_ITEMS }], footer: null };
    }

    if (legalSet.has(path)) {
      return { name: 'legal', groups: [{ title: null, items: LEGAL_ITEMS }], footer: null };
    }

    if (employeeSet.has(path)) {
      return {
        name: 'employee',
        groups: EMPLOYEE_GROUPS,
        footer: {
          type: 'meta',
          title: 'DevDock Team Mode',
          text: 'Internal access for staff handling workspace delivery operations.',
        },
      };
    }

    if (appSet.has(path)) {
      return { name: 'app', groups: APP_GROUPS, footer: null };
    }

    if (applySet.has(path)) {
      return {
        name: 'apply',
        groups: APPLY_ITEMS,
        footer: {
          type: 'meta',
          title: 'Apply With Context',
          text: 'Review the role details, then submit the form that matches how you want to help.',
        },
      };
    }

    return {
      name: 'public',
      groups: [{ title: null, items: PUBLIC_ITEMS }],
      footer: {
        type: 'meta',
        title: 'Explore DevDock',
        text: 'Start with the dashboard, then move into company pages and application details as needed.',
      },
    };
  }

  function renderSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const path = currentPath();
    const variant = resolveVariant(path);

    sidebar.innerHTML = `
      <div class="sidebar-top">
        <a class="sidebar-brand" href="/index.html">
          <span class="brand-icon">DevDock</span>
          <span>DevDock</span>
        </a>
        <button class="sidebar-collapse" type="button" aria-label="Collapse">›</button>
      </div>
      <nav class="sidebar-nav">${renderGroups(variant.groups, path, variant.name)}</nav>
      ${renderFooter(variant)}
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSidebar);
    return;
  }

  renderSidebar();
})();