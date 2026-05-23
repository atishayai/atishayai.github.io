(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('.reveal').forEach(function (el) {
    if (reduced) {
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
    }, { threshold: 0.15 });
    io.observe(el);
  });

  if (reduced) return;

  var heroName = document.querySelector('.hero h1.hero-name');
  if (heroName) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY * 0.12, 48);
        heroName.style.transform = 'translateY(' + y + 'px)';
        ticking = false;
      });
    }, { passive: true });
  }
})();
