'use strict';
(function initRtsVersion(root) {
  const VERSION = '1.1.3';
  const apply = () => {
    document.title = `Napoleonic RTS v${VERSION}`;
    const badge = document.querySelector('.version');
    if (badge) badge.textContent = `v${VERSION}`;
  };
  const finalizeBoot = () => {
    apply();
    document.body?.classList.remove('booting');
    document.documentElement.dataset.runtimeReady = 'true';
  };
  root.RTS_VERSION = VERSION;
  root.RTS_VERSION_INFO = Object.freeze({ version: VERSION, apply, finalizeBoot });
  apply();
})(window);
