/**
 * Nafsoléa — Content Loader
 * Charge les textes dynamiques depuis /api/v1/site-content et les injecte
 * dans tous les éléments portant l'attribut data-content-key="xxx".
 *
 * Usage dans une page :
 *   <h1 data-content-key="home.hero.title">Votre psy, enfin accessible</h1>
 *   <script src="assets/js/content.js"></script>
 *
 * Le texte par défaut dans le HTML est conservé si l'API échoue (fallback).
 */

(async function loadSiteContent() {
  // Récupère tous les éléments à hydrater
  const elements = document.querySelectorAll('[data-content-key]');
  if (!elements.length) return; // Rien à faire sur cette page

  try {
    // API.content.getAll() retourne { key: value, ... }
    const contentMap = await API.content.getAll();

    elements.forEach((el) => {
      const key = el.getAttribute('data-content-key');
      if (key && contentMap[key] !== undefined) {
        el.textContent = contentMap[key];
      }
    });
  } catch (err) {
    // Échec silencieux : le texte par défaut HTML reste affiché
    console.warn('[content.js] Impossible de charger les contenus du site :', err.message);
  }
})();
