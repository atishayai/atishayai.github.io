(function () {
  var html = document.documentElement;
  html.classList.add('js-ready');

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
  window.addEventListener('orientationchange', function () {
    applyViewport();
    scanRevealsInView();
  }, { passive: true });

  var revealObserver;

  function scanRevealsInView() {
    if (reduced) return;
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh * 0.92 && rect.bottom > 0) {
        el.classList.add('in');
        if (revealObserver) revealObserver.unobserve(el);
      }
    });
  }

  function initReveals() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (reduced) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }

    revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            e.target.classList.add('visible');
            revealObserver.unobserve(e.target);
          }
        });
      },
      {
        threshold: [0, 0.05, 0.12],
        root: null,
        rootMargin: '0px 0px 10% 0px'
      }
    );

    els.forEach(function (el) { revealObserver.observe(el); });

    /* Safari / mobile: elements already on screen at load often miss the first IO tick */
    if (document.readyState === 'complete') {
      scanRevealsInView();
    } else {
      window.addEventListener('load', scanRevealsInView, { once: true });
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(scanRevealsInView);
    });
  }

  function initNavScrolled() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
  }

  function initHero() {
    var heroName = document.querySelector('.hero h1.hero-name');
    var heroTag = document.querySelector('.hero .tag');
    var heroScroll = document.querySelector('.hero-scroll');

    function showHeroFallback() {
      if (heroName) {
        heroName.style.opacity = '1';
        if (!heroName.dataset.parallaxActive) {
          heroName.style.transform = '';
        }
      }
      if (heroTag) heroTag.style.opacity = '1';
      if (heroScroll) heroScroll.style.opacity = '1';
    }

    if (reduced) {
      showHeroFallback();
      return;
    }

    /* iOS sometimes skips CSS keyframes; guarantee visibility */
    setTimeout(showHeroFallback, 2200);

    if (!heroName) return;

    var ticking = false;

    function parallaxStrength() {
      var mode = viewportMode();
      if (mode === 'mobile') return 0.06;
      if (mode === 'tablet') return 0.09;
      return 0.12;
    }

    function parallaxCap() {
      return viewportMode() === 'mobile' ? 22 : 48;
    }

    window.addEventListener('scroll', function () {
      if (reduced) return;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY * parallaxStrength(), parallaxCap());
        if (y > 0) {
          heroName.dataset.parallaxActive = '1';
          heroName.style.transform = 'translate3d(0,' + y + 'px,0)';
        } else {
          delete heroName.dataset.parallaxActive;
          heroName.style.transform = '';
        }
        ticking = false;
      });
    }, { passive: true });
  }

  function boot() {
    applyViewport();
    initReveals();
    initNavScrolled();
    initHero();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
