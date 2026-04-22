/**
 * Nafsoléa — Admin UI helpers
 * Injecte automatiquement le bouton hamburger qui ouvre la sidebar sur mobile.
 * À inclure sur TOUTES les pages admin (en plus de auth.js et api.js).
 */
(function () {
  function init() {
    // Cherche la sidebar admin, sinon on sort
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Bouton hamburger
    if (!document.querySelector('.sidebar-toggle')) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-toggle';
      btn.setAttribute('aria-label', 'Ouvrir le menu');
      btn.innerHTML = '☰';
      document.body.appendChild(btn);

      // Overlay sombre derrière la sidebar quand elle est ouverte
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);

      const close = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      };
      const open = () => {
        sidebar.classList.add('open');
        overlay.classList.add('show');
      };
      btn.addEventListener('click', () => {
        sidebar.classList.contains('open') ? close() : open();
      });
      overlay.addEventListener('click', close);

      // Ferme la sidebar quand on clique sur un lien (utile sur mobile)
      sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

      // Fermer avec Échap
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
