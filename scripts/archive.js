/* Archive filtering for writing.html.
   Hides a year section when nothing under it survives the filter, so a
   heading never renders over an empty gap. */
(function () {
  var bar = document.getElementById('wfilters');
  var archive = document.getElementById('warchive');
  if (!bar || !archive) return;

  var buttons = [].slice.call(bar.querySelectorAll('.wfilter'));
  var entries = [].slice.call(archive.querySelectorAll('.wentry'));
  var years = [].slice.call(archive.querySelectorAll('.wyear'));

  function apply(kind) {
    entries.forEach(function (el) {
      var show = kind === 'all' || el.dataset.kind === kind;
      el.hidden = !show;
    });

    years.forEach(function (section) {
      var visible = section.querySelectorAll('.wentry:not([hidden])').length;
      section.hidden = visible === 0;
      var count = section.querySelector('.wyear-head span');
      if (count) {
        count.textContent = visible + (visible === 1 ? ' piece' : ' pieces');
      }
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      buttons.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      apply(btn.dataset.filter);

      var hash = btn.dataset.filter === 'all' ? ' ' : '#' + btn.dataset.filter;
      if (history.replaceState) history.replaceState(null, '', hash);
    });
  });

  var initial = location.hash.replace('#', '');
  if (initial === 'narrative' || initial === 'analytical') {
    var match = buttons.filter(function (b) { return b.dataset.filter === initial; })[0];
    if (match) match.click();
  }
})();
