// Client-side authentication handler (global, no modules)
(function () {
  function getAuthToken() {
    return localStorage.getItem('auth_token');
  }

  function setAuthToken(token) {
    localStorage.setItem('auth_token', token);
  }

  function clearAuthToken() {
    localStorage.removeItem('auth_token');
  }

  function decodeToken(token) {
    try {
      return JSON.parse(atob(token));
    } catch (e) {
      return null;
    }
  }

  function getCurrentUser() {
    const token = getAuthToken();
    if (!token) return null;

    const payload = decodeToken(token);
    if (!payload || !payload.user) return null;

    if (payload.exp && Date.now() > payload.exp * 1000) {
      clearAuthToken();
      return null;
    }

    return payload.user;
  }

  function isAuthenticated() {
    return !!getCurrentUser();
  }

  async function fetchWithAuth(url, options = {}) {
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
      headers,
    });

    if (response.status === 401) {
      clearAuthToken();
      window.location.href = '/login.html';
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
    const token = params.get('token');

    if (token) {
      setAuthToken(token);
      params.delete('token');
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
  window.getCurrentUser = getCurrentUser;
  window.fetchWithAuth = fetchWithAuth;
  window.getWorkspaces = getWorkspaces;
  window.createWorkspace = createWorkspace;
  window.initiateGoogleLogin = initiateGoogleLogin;
  window.initiateDiscordLogin = initiateDiscordLogin;
  window.handleAuthRedirect = handleAuthRedirect;
  window.logout = logout;

  document.addEventListener('DOMContentLoaded', () => {
    handleAuthRedirect();
  });
})();
