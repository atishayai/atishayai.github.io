(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var noHover = window.matchMedia('(hover: none)').matches;

  function viewportMode() {
    var w = window.innerWidth;
    if (w <= 600) return 'mobile';
    if (w <= 900) return 'tablet';
    return 'desktop';
  }

  function applyViewport() {
    var html = document.documentElement;
    html.dataset.viewport = viewportMode();
    html.dataset.pointer = coarse || noHover ? 'coarse' : 'fine';
    html.dataset.hover = noHover ? 'none' : 'hover';
  }

  applyViewport();
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyViewport, 120);
  }, { passive: true });
  window.addEventListener('orientationchange', applyViewport, { passive: true });

  document.querySelectorAll('.reveal').forEach(function (el) {
    if (reduced || viewportMode() === 'mobile') {
      el.classList.add('in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
  });

  if (reduced) return;

  var heroName = document.querySelector('.hero h1.hero-name');
  var allowParallax = heroName &&
    viewportMode() === 'desktop' &&
    !coarse &&
    !noHover;

  if (!allowParallax) return;

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (viewportMode() !== 'desktop') {
      heroName.style.transform = '';
      return;
    }
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = Math.min(window.scrollY * 0.12, 48);
      heroName.style.transform = 'translateY(' + y + 'px)';
      ticking = false;
    });
  }, { passive: true });
})();
