(function () {
  const SIGN_IN_PATH = '/signin-pages/signin.html';
  const LOGIN_PATH = '/login.html';
  const WORKSPACE_PATH = '/developerspaces.html';
  const SESSION_LABEL = 'Session Active';

  function normalizePath(value) {
    try {
      const pathname = new URL(value, window.location.origin).pathname || '/';
      if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
      }
      return pathname;
    } catch (_) {
      return String(value || '');
    }
  }

  const AUTH_PATHS = new Set([normalizePath(SIGN_IN_PATH), normalizePath(LOGIN_PATH)]);

  function getDisplayName(user) {
    return user && (user.name || user.username || user.email) ? (user.name || user.username || user.email) : 'your account';
  }

  function isAuthLink(anchor) {
    if (!anchor || !anchor.getAttribute) return false;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    return AUTH_PATHS.has(normalizePath(href));
  }

  function getLinkLabel(anchor) {
    const spans = anchor.querySelectorAll('span');
    if (spans.length > 1) {
      return spans[spans.length - 1].textContent.trim();
    }
    if (spans.length === 1 && anchor.classList.contains('sidebar-item')) {
      return spans[0].textContent.trim();
    }
    return anchor.textContent.trim();
  }

  function setLinkLabel(anchor, label) {
    const spans = anchor.querySelectorAll('span');
    if (spans.length > 1) {
      spans[spans.length - 1].textContent = label;
      return;
    }
    if (spans.length === 1 && anchor.classList.contains('sidebar-item')) {
      spans[0].textContent = label;
      return;
    }
    anchor.textContent = label;
  }

  function captureAuthLinkOriginals(anchor) {
    if (!anchor.dataset.sessionOriginalHref) {
      anchor.dataset.sessionOriginalHref = anchor.getAttribute('href') || SIGN_IN_PATH;
    }
    if (!anchor.dataset.sessionOriginalLabel) {
      anchor.dataset.sessionOriginalLabel = getLinkLabel(anchor) || 'Sign In';
    }
  }

  function updateAuthLinksForSession(isLoggedIn) {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      if (!isAuthLink(anchor)) {
        return;
      }

      captureAuthLinkOriginals(anchor);

      if (isLoggedIn) {
        anchor.setAttribute('href', WORKSPACE_PATH);
        setLinkLabel(anchor, 'Open Workspace');
        if (anchor.classList.contains('active')) {
          anchor.classList.remove('active');
        }
        return;
      }

      anchor.setAttribute('href', anchor.dataset.sessionOriginalHref || SIGN_IN_PATH);
      setLinkLabel(anchor, anchor.dataset.sessionOriginalLabel || 'Sign In');
    });
  }

  function ensureSessionStateBlock() {
    const existing = document.getElementById('index-session-state');
    if (existing) {
      return {
        state: existing,
        copy: document.getElementById('index-session-copy') || existing.querySelector('.session-copy'),
      };
    }

    let generated = document.querySelector('[data-public-session-state]');
    if (!generated) {
      const cardStack = document.querySelector('.content-card .card-stack');
      if (!cardStack) {
        return { state: null, copy: null };
      }

      generated = document.createElement('div');
      generated.className = 'session-state';
      generated.setAttribute('data-public-session-state', 'true');
      generated.setAttribute('role', 'status');
      generated.setAttribute('aria-live', 'polite');
      generated.hidden = true;
      generated.innerHTML = `
        <div class="session-pill">
          <span class="status-dot" aria-hidden="true"></span>
          <span>${SESSION_LABEL}</span>
        </div>
        <p class="session-copy"></p>
      `;

      const first = cardStack.firstElementChild;
      if (first) {
        first.insertAdjacentElement('afterend', generated);
      } else {
        cardStack.prepend(generated);
      }
    }

    return { state: generated, copy: generated.querySelector('.session-copy') };
  }

  function setLoggedOutState() {
    const session = ensureSessionStateBlock();

    if (session.state) {
      session.state.hidden = true;
    }

    if (session.copy) {
      session.copy.textContent = 'Sign in to continue where you left off.';
    }

    updateAuthLinksForSession(false);
  }

  function setLoggedInState(user) {
    const session = ensureSessionStateBlock();

    if (session.state) {
      session.state.hidden = false;
    }

    if (session.copy) {
      session.copy.textContent = `You are signed in as ${getDisplayName(user)}. Jump back into your workspace dashboard.`;
    }

    updateAuthLinksForSession(true);
  }

  async function resolveSessionUser() {
    if (window.syncAuthTokenFromCookie) {
      window.syncAuthTokenFromCookie();
    }

    const token = window.getAuthToken ? window.getAuthToken() : null;
    const localUser = window.getCurrentUser ? window.getCurrentUser() : null;

    if (!token) {
      return null;
    }

    try {
      const response = await fetch('/api/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        if (window.clearAuthToken) {
          window.clearAuthToken();
        }
        return null;
      }

      if (!response.ok) {
        return localUser;
      }

      const payload = await response.json();
      if (payload && payload.success && payload.user) {
        return payload.user;
      }

      return localUser;
    } catch (error) {
      console.warn('Unable to verify index session:', error);
      return localUser;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await resolveSessionUser();
    if (user) {
      setLoggedInState(user);
      return;
    }
    setLoggedOutState();
  });
})();
