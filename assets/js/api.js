/**
 * Nafsoléa — API Client
 * Centralise tous les appels vers le backend NestJS.
 * Usage: await API.get('/articles'), await API.post('/auth/login', { email, password })
 */

const API = (() => {
  // ── Configuration de l'URL du backend ────────────────────────────
  // À mettre à jour APRÈS le déploiement du backend sur Render.
  // Remplace la valeur de PROD_BACKEND_URL ci-dessous par l'URL que
  // Render t'aura donnée, par exemple : 'https://nafsolea-api.onrender.com'
  const PROD_BACKEND_URL = 'https://nafsolea-api.onrender.com'; // ⬅️ À remplacer après déploiement Render

  function resolveBaseUrl() {
    // Override explicite (utile pour tester une autre API)
    if (typeof window !== 'undefined' && window.NAFSOLEA_API_URL) {
      return window.NAFSOLEA_API_URL.replace(/\/+$/, '') + '/api/v1';
    }
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || host === 'file';
    if (isLocal) return 'http://localhost:3000/api/v1';
    return PROD_BACKEND_URL.replace(/\/+$/, '') + '/api/v1';
  }

  const BASE_URL = resolveBaseUrl();

  // ── Core fetch wrapper ───────────────────────────────────────────

  async function request(method, path, body = null, requiresAuth = false) {
    const headers = { 'Content-Type': 'application/json' };

    if (requiresAuth) {
      const token = Auth.getAccessToken();
      if (!token) {
        Auth.redirectToLogin();
        throw new Error('Non authentifié');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    let res = await fetch(`${BASE_URL}${path}`, options);

    // Access token expired → try silent refresh
    if (res.status === 401 && requiresAuth) {
      const refreshed = await Auth.silentRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${Auth.getAccessToken()}`;
        res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      } else {
        Auth.clearSession();
        Auth.redirectToLogin();
        throw new Error('Session expirée');
      }
    }

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const message =
        (Array.isArray(data?.errors) ? data.errors.join(', ') : null)
        ?? data?.message
        ?? `Erreur ${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  // ── Public helpers ───────────────────────────────────────────────

  const get  = (path)       => request('GET',    path, null, false);
  const post = (path, body) => request('POST',   path, body, false);

  // ── Authenticated helpers ────────────────────────────────────────

  const authGet    = (path)       => request('GET',    path, null, true);
  const authPost   = (path, body) => request('POST',   path, body, true);
  const authPut    = (path, body) => request('PUT',    path, body, true);
  const authPatch  = (path, body) => request('PATCH',  path, body, true);
  const authDelete = (path, body = null) => request('DELETE', path, body, true);

  // ── Auth endpoints ───────────────────────────────────────────────

  const auth = {
    login:          (email, password)  => post('/auth/login', { email, password }),
    register:       (dto)              => post('/auth/register', dto),
    logout:         (refreshToken)     => authPost('/auth/logout', { refreshToken }),
    refresh:        (refreshToken)     => post('/auth/refresh', { refreshToken }),
    verifyEmail:    (token)            => get(`/auth/verify-email?token=${token}`),
    forgotPassword: (email)            => post('/auth/forgot-password', { email }),
    resetPassword:  (token, password)  => post('/auth/reset-password', { token, password }),
  };

  // ── User endpoints ───────────────────────────────────────────────

  const users = {
    me:                  ()       => authGet('/users/me'),
    updateProfile:       (data)   => authPut('/users/me', data),
    updateAvatar:        (dataUrl)=> authPut('/users/me/avatar', { avatarUrl: dataUrl }),
    deleteAvatar:        ()       => authDelete('/users/me/avatar'),
    myAppointments:      (status) => authGet(`/users/me/appointments${status ? `?status=${status}` : ''}`),
    notifications:       (unread) => authGet(`/users/me/notifications${unread ? '?unread=true' : ''}`),
    markNotificationsRead: (ids)  => authPut('/users/me/notifications/read', { ids }),
    deleteAccount:       ()       => authDelete('/users/me'),
  };

  // ── Psychologist endpoints ───────────────────────────────────────

  const psychologists = {
    list:            (params = {}) => get(`/psychologists?${new URLSearchParams(params)}`),
    getOne:          (id)          => get(`/psychologists/${id}`),
    getSlots:        (id, from, days, serviceId) => {
      const params = new URLSearchParams({ from, days: String(days || 14) });
      if (serviceId) params.set('serviceId', serviceId);
      return get(`/psychologists/${id}/slots?${params}`);
    },
    // Public — prestations d'un psy
    getServices:     (id)          => get(`/psychologists/${id}/services`),
    // Psy logged-in
    myDashboard:     ()            => authGet('/psychologists/me/dashboard'),
    myAppointments:  (status)      => authGet(`/psychologists/me/appointments${status ? `?status=${status}` : ''}`),
    myPatients:      ()            => authGet('/psychologists/me/patients'),
    updateProfile:   (data)        => authPut('/psychologists/me/profile', data),
    myAvailability:  ()            => authGet('/psychologists/me/availability'),
    setAvailability: (slots)       => authPost('/psychologists/me/availability', { slots }),
    addBlockedSlot:  (data)        => authPost('/psychologists/me/blocked-slots', data),
    // Psy logged-in — gestion de SES prestations
    myServices:      ()            => authGet('/psychologists/me/services'),
    createService:   (data)        => authPost('/psychologists/me/services', data),
    updateService:   (id, data)    => authPut(`/psychologists/me/services/${id}`, data),
    deleteService:   (id)          => authDelete(`/psychologists/me/services/${id}`),
  };

  // ── Appointment endpoints ────────────────────────────────────────

  const appointments = {
    book:        (data)   => authPost('/appointments', data),
    cancel:      (id, reason) => authDelete(`/appointments/${id}`, { reason }),
    getVideo:    (id)     => authGet(`/appointments/${id}/video`),
    submitReview:(id, data)=> authPost(`/appointments/${id}/review`, data),
  };

  // ── Payment endpoints ────────────────────────────────────────────

  const payments = {
    config:           ()    => get('/payments/config'),
    getByAppointment: (id)  => authGet(`/payments/appointments/${id}`),
  };

  // ── Article endpoints ────────────────────────────────────────────

  const articles = {
    // Public
    list:          (params = {}) => get(`/articles?${new URLSearchParams(params)}`),
    getBySlug:     (slug)        => get(`/articles/${slug}`),
    categories:    ()            => get('/articles/categories'),
    // Admin
    adminAll:      (params = {}) => authGet(`/articles/admin/all?${new URLSearchParams(params)}`),
    adminStats:    ()            => authGet('/articles/admin/stats'),
    create:        (data)        => authPost('/articles', data),
    update:        (id, data)    => authPut(`/articles/${id}`, data),
    delete:        (id)          => authDelete(`/articles/${id}`),
  };

  // ── Newsletter endpoints ─────────────────────────────────────────

  const newsletter = {
    // Public
    subscribe:    (email, source = 'homepage') => post('/newsletter/subscribe', { email, source }),
    unsubscribe:  (token)      => get(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`),
    // Admin
    stats:        ()           => authGet('/newsletter/admin/stats'),
    subscribers:  (params={})  => authGet(`/newsletter/admin/subscribers?${new URLSearchParams(params)}`),
    deleteSubscriber: (id)     => authDelete(`/newsletter/admin/subscribers/${id}`),
    campaigns:    (params={})  => authGet(`/newsletter/admin/campaigns?${new URLSearchParams(params)}`),
    createCampaign:(data)      => authPost('/newsletter/admin/campaigns', data),
    sendCampaign: (id)         => authPost(`/newsletter/admin/campaigns/${id}/send`),
    deleteCampaign:(id)        => authDelete(`/newsletter/admin/campaigns/${id}`),
  };

  // ── Contenu du site (CMS) ───────────────────────────────────────

  const content = {
    // Public — retourne { key: value } pour toutes les pages
    getAll: () => get('/site-content'),
  };

  // ── Admin endpoints ──────────────────────────────────────────────

  const admin = {
    dashboard:           ()         => authGet('/admin/dashboard'),
    pendingPsychologists:()         => authGet('/admin/psychologists/pending'),
    approve:             (id)       => authPost(`/admin/psychologists/${id}/approve`),
    reject:              (id, reason) => authPost(`/admin/psychologists/${id}/reject`, { reason }),
    updatePsychologist:  (id, data)  => authPut(`/admin/psychologists/${id}`, data),
    users:               (params={})=> authGet(`/admin/users?${new URLSearchParams(params)}`),
    suspendUser:         (id)       => authPatch(`/admin/users/${id}/suspend`),
    verifyUserEmail:     (id)       => authPost(`/admin/users/${id}/verify-email`),
    appointments:        (params={})=> authGet(`/admin/appointments?${new URLSearchParams(params)}`),
    revenue:             (from, to) => authGet(`/admin/revenue?from=${from}&to=${to}`),
    auditLogs:           (params={})=> authGet(`/admin/audit-logs?${new URLSearchParams(params)}`),
    // Admin — gestion des prestations d'un psy
    listServices:        (psyId)              => authGet(`/admin/psychologists/${psyId}/services`),
    createService:       (psyId, data)        => authPost(`/admin/psychologists/${psyId}/services`, data),
    updateService:       (psyId, sid, data)   => authPut(`/admin/psychologists/${psyId}/services/${sid}`, data),
    deleteService:       (psyId, sid)         => authDelete(`/admin/psychologists/${psyId}/services/${sid}`),
    // Admin — gestion des contenus du site (CMS)
    listContent:         ()                   => authGet('/admin/site-content'),
    updateContent:       (key, value)         => authPut(`/admin/site-content/${encodeURIComponent(key)}`, { value }),
  };

  return { get, post, authGet, authPost, authPut, authPatch, authDelete, auth, users, psychologists, appointments, payments, articles, newsletter, content, admin };
})();
