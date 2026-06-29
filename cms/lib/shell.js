/**
 * Shared site nav/footer for published pages (atishay.io v2 style).
 * depth: 0 = site root (index.html), 1 = one level down (articles/, etc.)
 */
const SITE_EMAIL = 'atishayioai@gmail.com';

function prefix(depth) {
  return depth > 0 ? '../'.repeat(depth) : '';
}

function renderSiteNav(depth = 0, { active = '' } = {}) {
  const p = prefix(depth);
  const aboutHref = `${p}index.html#about`;
  const writingHref = `${p}writing.html`;

  const link = (href, label, key) => {
    const cls = active === key ? ' class="active"' : '';
    return `<li><a href="${href}"${cls}>${label}</a></li>`;
  };

  return `<nav class="v2-nav" id="nav">
  <a class="v2-nav-logo" href="${p}index.html">atishay</a>
  <ul class="v2-nav-links">
    ${link(aboutHref, 'about', 'about')}
    ${link(writingHref, 'writing', 'writing')}
  </ul>
</nav>`;
}

function renderSiteFooter() {
  return `<footer class="v2-footer">
  <div>
    <div class="v2-footer-email"><a href="mailto:${SITE_EMAIL}">${SITE_EMAIL}</a></div>
  </div>
  <div class="v2-footer-socials v2-footer-x">
    <a href="https://x.com/atishayai" target="_blank" rel="noopener noreferrer">@atishayai</a>
  </div>
  <div class="v2-footer-copy">© atishay.io 2026</div>
</footer>`;
}

module.exports = {
  SITE_EMAIL,
  renderSiteNav,
  renderSiteFooter,
  prefix,
};
