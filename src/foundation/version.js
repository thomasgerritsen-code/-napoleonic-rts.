'use strict';
(function initRtsVersion(root) {
  const VERSION = '1.2.0';
  const app = document.getElementById('app');
  if (app) app.style.visibility = 'hidden';

  const apply = () => {
    document.title = `Napoleonic RTS v${VERSION}`;
    const badge = document.querySelector('.version');
    if (badge) badge.textContent = `v${VERSION}`;
  };
  const finalizeBoot = () => {
    apply();
    if (app) app.style.visibility = 'visible';
    document.documentElement.dataset.runtimeReady = 'true';
  };

  root.RTS_VERSION = VERSION;
  root.RTS_VERSION_INFO = Object.freeze({ version: VERSION, apply, finalizeBoot });
  apply();
  if (document.readyState === 'complete') finalizeBoot();
  else root.addEventListener('load', finalizeBoot, { once: true });
})(window);
