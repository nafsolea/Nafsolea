/* ============================================================
   NAFSOLÉA — JavaScript Principal
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. NAVIGATION SCROLL ─────────────────────────────────── */
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  /* ── 2. MENU MOBILE ───────────────────────────────────────── */
  const hamburger = document.querySelector('.nav__hamburger');
  const mobileMenu = document.querySelector('.nav__mobile');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
  }

  /* ── 3. ACTIVE NAV LINK ───────────────────────────────────── */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link, .nav__mobile-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  /* ── 4. SCROLL REVEAL ANIMATIONS ─────────────────────────── */
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(el => observer.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('visible'));
  }

  /* ── 5. SCROLL TO TOP ─────────────────────────────────────── */
  const scrollTopBtn = document.querySelector('.scroll-top');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ── 6. FAQ ACCORDION ─────────────────────────────────────── */
  document.querySelectorAll('.faq-item__question').forEach(question => {
    question.addEventListener('click', () => {
      const item = question.closest('.faq-item');
      const isOpen = item.classList.contains('open');

      // Close all
      document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));

      // Open clicked if was closed
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

  /* ── 7. FILTRE PSYCHOLOGUES ───────────────────────────────── */
  const filterTabs = document.querySelectorAll('.filter-tab');
  const psychCards = document.querySelectorAll('[data-filter]');

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.dataset.filter;
      psychCards.forEach(card => {
        const show = filter === 'all' || card.dataset.filter?.includes(filter);
        card.style.display = show ? '' : 'none';
        card.style.opacity = show ? '1' : '0';
      });
    });
  });

  /* ── 8. QUIZ D'ORIENTATION ────────────────────────────────── */
  const quizData = [
    {
      question: "Qu'est-ce qui vous amène à chercher un soutien psychologique ?",
      options: [
        "Je me sens seul(e) ou isolé(e)",
        "Je traverse une période de stress intense",
        "Des tensions familiales ou relationnelles",
        "Je vis loin de mes proches (expatriation)",
        "Autre chose"
      ]
    },
    {
      question: "Dans quelle langue préférez-vous consulter ?",
      options: [
        "En français",
        "En arabe (الدارجة / الفصحى)",
        "Les deux, ça m'est égal",
        "Je ne suis pas sûr(e)"
      ]
    },
    {
      question: "Comment vous sentez-vous en ce moment ?",
      options: [
        "Anxieux(se) ou sous pression",
        "Triste ou sans énergie",
        "Perdu(e) dans mes choix de vie",
        "Bien, mais je veux prévenir",
        "En situation de crise"
      ]
    },
    {
      question: "Avez-vous déjà consulté un psychologue auparavant ?",
      options: [
        "Non, c'est la première fois",
        "Oui, et ça m'a aidé",
        "Oui, mais pas de très bonne expérience",
        "Pas de psychologue, mais d'autres accompagnements"
      ]
    }
  ];

  let currentQuestion = 0;
  let quizAnswers = [];

  const quizOverlay = document.querySelector('.quiz-overlay');
  const quizModal = document.querySelector('.quiz-modal');

  if (quizOverlay) {
    // Open quiz
    document.querySelectorAll('[data-quiz-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentQuestion = 0;
        quizAnswers = [];
        renderQuizQuestion(0);
        quizOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    // Close quiz
    const closeBtn = quizModal?.querySelector('.quiz-modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeQuiz);
    }

    quizOverlay.addEventListener('click', e => {
      if (e.target === quizOverlay) closeQuiz();
    });
  }

  function closeQuiz() {
    quizOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderQuizQuestion(index) {
    const questionEl = document.querySelector('.quiz-question');
    const optionsEl = document.querySelector('.quiz-options');
    const progressBar = document.querySelector('.quiz-progress__bar');
    const stepEl = document.querySelector('.quiz-step');

    if (!questionEl || !optionsEl) return;

    const progress = ((index) / quizData.length) * 100;
    if (progressBar) progressBar.style.width = progress + '%';
    if (stepEl) stepEl.textContent = `Question ${index + 1}/${quizData.length}`;

    const data = quizData[index];
    questionEl.textContent = data.question;
    optionsEl.innerHTML = '';

    data.options.forEach((option, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = option;
      btn.addEventListener('click', () => selectQuizOption(i, option));
      optionsEl.appendChild(btn);
    });
  }

  function selectQuizOption(index, value) {
    document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('.quiz-option')[index].classList.add('selected');
    quizAnswers[currentQuestion] = value;

    setTimeout(() => {
      currentQuestion++;
      if (currentQuestion < quizData.length) {
        renderQuizQuestion(currentQuestion);
      } else {
        showQuizResult();
      }
    }, 400);
  }

  function showQuizResult() {
    const questionEl = document.querySelector('.quiz-question');
    const optionsEl = document.querySelector('.quiz-options');
    const progressBar = document.querySelector('.quiz-progress__bar');
    const stepEl = document.querySelector('.quiz-step');

    if (progressBar) progressBar.style.width = '100%';
    if (stepEl) stepEl.textContent = 'Résultat';
    if (questionEl) questionEl.textContent = 'Voici notre recommandation pour vous';

    if (optionsEl) {
      optionsEl.innerHTML = `
        <div style="text-align:center; padding: 1.5rem 0;">
          <div style="font-size:3rem; margin-bottom:1rem;">🌿</div>
          <p style="font-family:var(--font-heading); font-size:1.1rem; font-style:italic; color:var(--text); margin-bottom:0.5rem; max-width:none;">
            Nous avons trouvé des psychologues qui vous correspondent.
          </p>
          <p style="font-size:0.88rem; color:var(--text-light); margin-bottom:1.5rem; max-width:none;">
            Basé sur vos réponses, nous vous recommandons des thérapeutes spécialisés en soutien émotionnel, culturellement sensibles, disponibles dans la langue de votre choix.
          </p>
          <a href="psychologues.html" class="btn btn--primary btn--lg" onclick="closeQuiz()">
            Découvrir mes psychologues →
          </a>
        </div>
      `;
    }
  }

  /* ── 9. COOKIE BANNER ─────────────────────────────────────── */
  const cookieBanner = document.querySelector('.cookie-banner');
  if (cookieBanner && !localStorage.getItem('nafsolea-cookies')) {
    setTimeout(() => cookieBanner.classList.add('show'), 1500);

    document.querySelector('.cookie-accept')?.addEventListener('click', () => {
      localStorage.setItem('nafsolea-cookies', 'accepted');
      cookieBanner.classList.remove('show');
    });

    document.querySelector('.cookie-decline')?.addEventListener('click', () => {
      localStorage.setItem('nafsolea-cookies', 'declined');
      cookieBanner.classList.remove('show');
    });
  }

  /* ── 10. COMPTEUR ANIMÉ (stats) ──────────────────────────── */
  function animateCounter(el, target, duration = 2000) {
    const start = 0;
    const step = (timestamp) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (target - start) * eased) + (el.dataset.suffix || '');
      if (progress < 1) requestAnimationFrame(step);
    };
    let startTime;
    requestAnimationFrame(ts => { startTime = ts; step(ts); });
  }

  const statsEls = document.querySelectorAll('[data-counter]');
  if (statsEls.length && 'IntersectionObserver' in window) {
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          animateCounter(el, parseInt(el.dataset.counter), 2000);
          statsObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    statsEls.forEach(el => statsObserver.observe(el));
  }

  /* ── 11. NEWSLETTER FORM ─────────────────────────────────── */
  document.querySelectorAll('.newsletter-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (input && input.value) {
        form.innerHTML = `
          <div style="text-align:center; padding:1rem;">
            <div style="font-size:2rem; margin-bottom:0.5rem;">🌿</div>
            <p style="font-weight:600; color:var(--sage-dark); margin-bottom:0.25rem; max-width:none;">Merci pour votre inscription !</p>
            <p style="font-size:0.88rem; color:var(--text-light); max-width:none;">Vous recevrez prochainement nos ressources.</p>
          </div>
        `;
      }
    });
  });

  /* ── 12. SMOOTH ANCHOR SCROLL ────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

});

/* ── HELPER: Format date ──────────────────────────────────── */
function formatDate(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(date);
}

/* ── EXPORT pour usage externe ────────────────────────────── */
window.Nafsolea = { formatDate };
