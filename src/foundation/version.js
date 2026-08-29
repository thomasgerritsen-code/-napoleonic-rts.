'use strict';
(function initRtsVersion(root) {
  const VERSION = '1.0.0';
  const apply = () => {
    document.title = `Napoleonic RTS v${VERSION}`;
    const badge = document.querySelector('.version');
    if (badge) badge.textContent = `v${VERSION}`;
  };
  root.RTS_VERSION = VERSION;
  root.RTS_VERSION_INFO = Object.freeze({ version: VERSION, apply });
  apply();
})(window);
