// Client-side authentication handler (global, no modules)
(function () {
  const AUTH_TOKEN_KEY = 'auth_token';
  const AUTH_COOKIE_KEY = 'auth_token';
  const AUTH_USER_CACHE_KEY = 'auth_user_cache';
  const GLOBAL_ROLE_ORDER = ['user', 'staff', 'moderator', 'administrator', 'co-owner', 'owner'];

  function getCookieValue(name) {
    const cookie = String(document.cookie || '');
    if (!cookie) return null;

    const pairs = cookie.split(';');
    for (const pair of pairs) {
      const [rawKey, ...rest] = pair.trim().split('=');
      if (rawKey !== name) continue;
      const rawValue = rest.join('=');
      if (!rawValue) return null;
      try {
        return decodeURIComponent(rawValue);
      } catch (_) {
        return rawValue;
      }
    }
    return null;
  }

  function writeAuthCookie(token) {
    if (!token) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
  }

  function clearAuthCookie() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${AUTH_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }

  function readCookieToken() {
    return getCookieValue(AUTH_COOKIE_KEY);
  }

  function getCachedUser() {
    try {
      const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function setCachedUser(user) {
    if (!user) return;
    try {
      sessionStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
    } catch (_) {}
  }

  function clearCachedUser() {
    try {
      sessionStorage.removeItem(AUTH_USER_CACHE_KEY);
    } catch (_) {}
  }

  function syncAuthTokenFromCookie() {
    const cookieToken = readCookieToken();
    if (!cookieToken) return false;

    const currentToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (currentToken !== cookieToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, cookieToken);
    }
    return true;
  }

  function getAuthToken() {
    const localToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (localToken) return localToken;

    const cookieToken = readCookieToken();
    if (cookieToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, cookieToken);
      return cookieToken;
    }

    return null;
  }

  function setAuthToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    writeAuthCookie(token);
  }

  function clearAuthToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    clearAuthCookie();
    clearCachedUser();
  }

  function decodeBase64Json(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? `${normalized}${'='.repeat(4 - pad)}` : normalized;
    return JSON.parse(atob(padded));
  }

  function decodeToken(token) {
    try {
      if (!token) return null;

      if (token.includes('.')) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const jwtPayload = decodeBase64Json(parts[1]);
          if (jwtPayload && jwtPayload.user) {
            return jwtPayload;
          }
        }
      }

      return decodeBase64Json(token);
    } catch (e) {
      return null;
    }
  }

  function getCurrentUser() {
    const token = getAuthToken();
    if (!token) {
      return getCachedUser();
    }

    const payload = decodeToken(token);
    if (!payload || !payload.user) {
      return getCachedUser();
    }

    if (payload.exp && Date.now() > payload.exp * 1000) {
      clearAuthToken();
      return null;
    }

    setCachedUser(payload.user);
    return payload.user;
  }

  function isAuthenticated() {
    return !!(getCurrentUser() || getAuthToken());
  }

  function normalizeGlobalRole(role) {
    const normalized = String(role || 'user').toLowerCase().trim();
    if (normalized === 'admin') return 'administrator';
    if (normalized === 'coowner') return 'co-owner';
    if (GLOBAL_ROLE_ORDER.includes(normalized)) return normalized;
    return 'user';
  }

  function getGlobalRoleRank(role) {
    const normalized = normalizeGlobalRole(role);
    const rank = GLOBAL_ROLE_ORDER.indexOf(normalized);
    return rank === -1 ? 0 : rank;
  }

  function isOwnerRole(role) {
    return normalizeGlobalRole(role) === 'owner';
  }

  function isStaffRole(role) {
    return getGlobalRoleRank(role) >= getGlobalRoleRank('staff');
  }

  function isEmployeeRole(role) {
    return isStaffRole(role);
  }

  function isAdminRole(role) {
    return getGlobalRoleRank(role) >= getGlobalRoleRank('moderator');
  }

  function normalizeWorkspaceRole(role) {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'admin') return 'workspace-admin';
    if (['workspace-admin', 'head-developer', 'developer', 'viewer'].includes(normalized)) {
      return normalized;
    }
    return 'developer';
  }

  function isWorkspaceAdminRole(role) {
    const normalized = normalizeWorkspaceRole(role);
    return normalized === 'workspace-admin' || normalized === 'head-developer';
  }

  function applyOwnerOnlyVisibility(role) {
    const show = isOwnerRole(role);
    document.querySelectorAll('[data-owner-only]').forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
    applyEmployeeOnlyVisibility(role);
    return show;
  }

  function applyEmployeeOnlyVisibility(role) {
    const show = isEmployeeRole(role);
    document.querySelectorAll('[data-employee-only]').forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
    return show;
  }

  function applyAdminOnlyVisibility(role) {
    const show = isAdminRole(role);
    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
    applyEmployeeOnlyVisibility(role);
    return show;
  }

  async function fetchWithAuth(url, options = {}) {
    // Ensure callback token is applied before any protected API call.
    handleAuthRedirect();
    syncAuthTokenFromCookie();

    const token = getAuthToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      credentials: options.credentials || 'include',
      headers,
    });

    if (response.status === 401) {
      const retryAllowed = !options.__authRetry;
      if (retryAllowed && syncAuthTokenFromCookie()) {
        const freshToken = getAuthToken();
        if (freshToken && freshToken !== token) {
          const retryHeaders = {
            'Content-Type': 'application/json',
            ...options.headers,
            Authorization: `Bearer ${freshToken}`,
          };
          const retryResponse = await fetch(url, {
            ...options,
            __authRetry: true,
            credentials: options.credentials || 'include',
            headers: retryHeaders,
          });
          if (retryResponse.status !== 401) {
            return retryResponse;
          }
        }
      }

      clearAuthToken();
      if (!window.location.pathname.includes('/login.html')) {
        window.location.href = '/login.html';
      }
      return null;
    }

    return response;
  }

  async function getWorkspaces() {
    const response = await fetchWithAuth('/api/workspaces');
    if (!response) return [];

    const data = await response.json();
    return data.workspaces || [];
  }

  async function createWorkspace(name, description = '') {
    const response = await fetchWithAuth('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });

    if (!response) return null;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create workspace');
    }

    const data = await response.json();
    return data.workspace;
  }

  function initiateGoogleLogin() {
    window.location.href = '/api/auth-google';
  }

  function initiateDiscordLogin() {
    window.location.href = '/api/auth-discord';
  }

  function handleAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('auth_token') || params.get('access_token');

    if (token) {
      setAuthToken(token);
      params.delete('token');
      params.delete('auth_token');
      params.delete('access_token');
      const nextUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, document.title, nextUrl);
      return true;
    }

    return false;
  }

  function logout() {
    clearAuthToken();
    window.location.href = '/login.html';
  }

  const api = {
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    isAuthenticated,
    normalizeGlobalRole,
    getGlobalRoleRank,
    isOwnerRole,
    isStaffRole,
    isEmployeeRole,
    isAdminRole,
    normalizeWorkspaceRole,
    isWorkspaceAdminRole,
    applyOwnerOnlyVisibility,
    applyEmployeeOnlyVisibility,
    applyAdminOnlyVisibility,
    syncAuthTokenFromCookie,
    getCurrentUser,
    fetchWithAuth,
    getWorkspaces,
    createWorkspace,
    initiateGoogleLogin,
    initiateDiscordLogin,
    handleAuthRedirect,
    logout,
  };

  window.auth = api;
  window.getAuthToken = getAuthToken;
  window.setAuthToken = setAuthToken;
  window.clearAuthToken = clearAuthToken;
  window.isAuthenticated = isAuthenticated;
  window.normalizeGlobalRole = normalizeGlobalRole;
  window.getGlobalRoleRank = getGlobalRoleRank;
  window.isOwnerRole = isOwnerRole;
  window.isStaffRole = isStaffRole;
  window.isEmployeeRole = isEmployeeRole;
  window.isAdminRole = isAdminRole;
  window.normalizeWorkspaceRole = normalizeWorkspaceRole;
  window.isWorkspaceAdminRole = isWorkspaceAdminRole;
  window.applyOwnerOnlyVisibility = applyOwnerOnlyVisibility;
  window.applyEmployeeOnlyVisibility = applyEmployeeOnlyVisibility;
  window.applyAdminOnlyVisibility = applyAdminOnlyVisibility;
  window.syncAuthTokenFromCookie = syncAuthTokenFromCookie;
  window.getCurrentUser = getCurrentUser;
  window.fetchWithAuth = fetchWithAuth;
  window.getWorkspaces = getWorkspaces;
  window.createWorkspace = createWorkspace;
  window.initiateGoogleLogin = initiateGoogleLogin;
  window.initiateDiscordLogin = initiateDiscordLogin;
  window.handleAuthRedirect = handleAuthRedirect;
  window.logout = logout;

  // Run once immediately so OAuth callback tokens are available before any deferred script executes.
  handleAuthRedirect();
  syncAuthTokenFromCookie();

  document.addEventListener('DOMContentLoaded', () => {
    handleAuthRedirect();
    syncAuthTokenFromCookie();
  });
})();

