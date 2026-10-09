'use strict';
(function initRtsVersion(root) {
  const VERSION = '1.3.22';
  const deployment = root.RTS_DEPLOYMENT_INFO;
  const published = deployment &&
    /^[0-9a-f]{40}$/i.test(deployment.commit) &&
    Number.isSafeInteger(deployment.runNumber) &&
    deployment.runNumber > 0;
  // The package's semantic version is intentionally independent of deployments.
  // Every successful main deployment has a unique GitHub Actions run number.
  const release = published ? `${VERSION}-b${deployment.runNumber}` : VERSION;
  const app = document.getElementById('app');
  if (app) app.style.visibility = 'hidden';

  const apply = () => {
    document.title = `Napoleonic RTS v${release}`;
    const badge = document.querySelector('.version');
    if (badge) {
      badge.textContent = `v${release}`;
      badge.title = published
        ? `Gepubliceerde build #${deployment.runNumber} · commit ${deployment.commit.slice(0, 7)} · ${deployment.deployedAt || 'datum onbekend'}`
        : 'Lokale ontwikkelversie (geen gepubliceerde build)';
    }
  };
  const finalizeBoot = () => {
    apply();
    if (app) app.style.visibility = 'visible';
    document.documentElement.dataset.runtimeReady = 'true';
  };

  root.RTS_VERSION = VERSION;
  root.RTS_VERSION_INFO = Object.freeze({
    version: VERSION,
    release,
    buildNumber: published ? deployment.runNumber : null,
    commit: published ? deployment.commit : null,
    apply,
    finalizeBoot
  });
  apply();
  if (document.readyState === 'complete') finalizeBoot();
  else root.addEventListener('load', finalizeBoot, { once: true });
})(window);
