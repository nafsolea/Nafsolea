/**
 * Nafsoléa — Auth Module
 * Gère les tokens JWT, la session, les redirections et le rafraîchissement silencieux.
 *
 * Stockage: localStorage (acceptable pour SPA sans SSR).
 * Rotation automatique du refresh token à chaque renouvellement.
 */

const Auth = (() => {
  const KEYS = {
    ACCESS_TOKEN:  'naf_access',
    REFRESH_TOKEN: 'naf_refresh',
    ROLE:          'naf_role',
    EXPIRES_AT:    'naf_expires',
  };

  // ── Storage helpers ──────────────────────────────────────────────

  function setSession({ accessToken, refreshToken, role }) {
    // Decode JWT to get expiry (exp is in seconds)
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      localStorage.setItem(KEYS.EXPIRES_AT, payload.exp * 1000);
    } catch {
      // Fallback: 15 min from now
      localStorage.setItem(KEYS.EXPIRES_AT, Date.now() + 15 * 60 * 1000);
    }
    localStorage.setItem(KEYS.ACCESS_TOKEN,  accessToken);
    localStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken);
    localStorage.setItem(KEYS.ROLE,          role);
  }

  function clearSession() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  function getAccessToken()  { return localStorage.getItem(KEYS.ACCESS_TOKEN); }
  function getRefreshToken() { return localStorage.getItem(KEYS.REFRESH_TOKEN); }
  function getRole()         { return localStorage.getItem(KEYS.ROLE); }

  function isLoggedIn() {
    return !!getAccessToken();
  }

  function isTokenExpired() {
    const exp = parseInt(localStorage.getItem(KEYS.EXPIRES_AT) ?? '0', 10);
    return Date.now() > exp - 30_000; // 30s buffer
  }

  // ── Silent refresh ───────────────────────────────────────────────

  let refreshPromise = null; // prevent concurrent refresh calls

  async function silentRefresh() {
    if (refreshPromise) return refreshPromise;

    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    refreshPromise = (async () => {
      try {
        const res = await fetch('http://localhost:3000/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        setSession(data);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  // ── Auto-refresh: renew 2 min before expiry ──────────────────────

  function startAutoRefresh() {
    setInterval(async () => {
      if (isLoggedIn() && isTokenExpired()) {
        const ok = await silentRefresh();
        if (!ok) {
          clearSession();
          redirectToLogin();
        }
      }
    }, 60_000); // check every minute
  }

  // ── Logout ───────────────────────────────────────────────────────

  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await fetch('http://localhost:3000/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch { /* non-blocking */ }
    }
    clearSession();
    const inAdmin = window.location.pathname.includes('/admin/');
    window.location.href = inAdmin ? '../login.html' : 'login.html';
  }

  // ── Route protection ─────────────────────────────────────────────

  function requireAuth(redirectAfter) {
    if (!isLoggedIn()) {
      const inAdmin = window.location.pathname.includes('/admin/');
      const loginBase = inAdmin ? '../login.html' : 'login.html';
      const target = redirectAfter || (window.location.pathname + window.location.search);
      window.location.href = `${loginBase}?redirect=${encodeURIComponent(target)}`;
      return false;
    }
    return true;
  }

  function requireRole(role) {
    if (!isLoggedIn()) { redirectToLogin(); return false; }
    if (getRole() !== role) {
      // Redirect to the site root (not admin root) to avoid loops
      const inAdmin = window.location.pathname.includes('/admin/');
      window.location.href = inAdmin ? '../index.html' : 'index.html';
      return false;
    }
    return true;
  }

  function redirectToLogin() {
    const inAdmin = window.location.pathname.includes('/admin/');
    const loginBase = inAdmin ? '../login.html' : 'login.html';
    const current = window.location.pathname + window.location.search;
    window.location.href = `${loginBase}?redirect=${encodeURIComponent(current)}`;
  }

  // ── Nav injection ────────────────────────────────────────────────
  // Injects auth links into .nav__actions and .nav__mobile if they
  // don't already have data-nav elements.

  function injectAuthUI() {
    // Detect if we're in the admin subfolder (links need ../ prefix)
    const inAdmin = window.location.pathname.includes('/admin/');
    const loginHref = inAdmin ? '../login.html' : 'login.html';
    const adminHref = inAdmin ? 'index.html' : 'admin/index.html';

    const accountHref = inAdmin ? '../mon-compte.html' : 'mon-compte.html';

    // ── Desktop nav ──
    const navActions = document.querySelector('.nav__actions');
    if (navActions && !navActions.querySelector('[data-nav]')) {
      const rdvBtn = navActions.querySelector('a[href*="rendez-vous"]');
      const html = `<a href="${loginHref}" class="btn btn--ghost btn--sm" data-nav="login">Se connecter</a>
      <a href="${accountHref}" class="btn btn--ghost btn--sm" data-nav="account" style="display:none">Mon compte</a>
      <a href="#" class="btn btn--ghost btn--sm" data-nav="logout" style="display:none">Se déconnecter</a>
      <a href="${adminHref}" class="btn btn--ghost btn--sm" data-nav="admin" style="display:none">Admin</a>`;
      if (rdvBtn) rdvBtn.insertAdjacentHTML('beforebegin', html);
      else navActions.insertAdjacentHTML('beforeend', html);
    }

    // ── Mobile nav ──
    const navMobile = document.querySelector('.nav__mobile');
    if (navMobile && !navMobile.querySelector('[data-nav]')) {
      const mobilePrimary = navMobile.querySelector('.btn--primary');
      const mobileHtml = `<a href="${loginHref}" class="nav__mobile-link" data-nav="login">Se connecter</a>
    <a href="${accountHref}" class="nav__mobile-link" data-nav="account" style="display:none">Mon compte</a>
    <a href="#" class="nav__mobile-link" data-nav="logout" style="display:none">Se déconnecter</a>
    <a href="${adminHref}" class="nav__mobile-link" data-nav="admin" style="display:none">Admin ↗</a>
    `;
      if (mobilePrimary) mobilePrimary.insertAdjacentHTML('beforebegin', mobileHtml);
      else navMobile.insertAdjacentHTML('beforeend', mobileHtml);
    }
  }

  function updateNav() {
    injectAuthUI();

    const loginLink   = document.querySelector('[data-nav="login"]');
    const logoutLink  = document.querySelector('[data-nav="logout"]');
    const accountLink = document.querySelector('[data-nav="account"]');
    const adminLink   = document.querySelector('[data-nav="admin"]');

    if (isLoggedIn()) {
      if (loginLink)   loginLink.style.display   = 'none';
      if (logoutLink)  logoutLink.style.display  = '';
      if (accountLink) accountLink.style.display = getRole() !== 'ADMIN' ? '' : 'none';
      if (adminLink)   adminLink.style.display   = getRole() === 'ADMIN' ? '' : 'none';
    } else {
      if (loginLink)   loginLink.style.display   = '';
      if (logoutLink)  logoutLink.style.display  = 'none';
      if (accountLink) accountLink.style.display = 'none';
      if (adminLink)   adminLink.style.display   = 'none';
    }

    if (logoutLink && !logoutLink.dataset.listenerAttached) {
      logoutLink.dataset.listenerAttached = '1';
      logoutLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    }
  }

  // ── Init (call once on page load) ────────────────────────────────

  function init() {
    startAutoRefresh();
    updateNav();
  }

  return {
    setSession,
    clearSession,
    getAccessToken,
    getRefreshToken,
    getRole,
    isLoggedIn,
    isTokenExpired,
    silentRefresh,
    logout,
    requireAuth,
    requireRole,
    redirectToLogin,
    updateNav,
    init,
  };
})();

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => Auth.init());
