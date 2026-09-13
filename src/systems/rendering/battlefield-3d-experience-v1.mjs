// v1.3.6: non-invasive 3D experience hardening around the public renderer API.
const api = window.__BATTLEFIELD_3D_V1__;
const canvas = document.getElementById('battlefield3d');
const modeButton = document.getElementById('renderModeBtn');

if (!api || !canvas || !modeButton) {
  console.warn('3D experience layer skipped: renderer API not ready.');
} else {
  const STORAGE_KEY = 'nrts-render-mode';
  let fallbackReason = '';

  function setMode(enabled, { persist = true, status = true } = {}) {
    api.setEnabled(Boolean(enabled));
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, enabled ? '3d' : '2d'); } catch (_) {}
    }
    document.documentElement.dataset.renderMode = enabled ? '3d' : '2d';
    if (status) {
      const label = enabled ? '3D-weergave actief.' : '2D-weergave actief.';
      window.NRTS_3D_SOURCE?.setStatus?.(fallbackReason ? `${label} ${fallbackReason}` : label);
    }
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '2d') setMode(false, { persist: false, status: false });
    else if (stored === '3d') setMode(true, { persist: false, status: false });
  } catch (_) {}

  modeButton.addEventListener('click', () => {
    queueMicrotask(() => setMode(api.enabled(), { persist: true, status: false }));
  });

  window.addEventListener('keydown', event => {
    if (!(event.altKey && event.code === 'Digit3')) return;
    if (event.repeat) return;
    event.preventDefault();
    setMode(!api.enabled());
  });
  modeButton.title = `${modeButton.title} · Alt+3 wisselt direct`;

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallbackReason = 'WebGL-context verloren; veilig teruggeschakeld naar 2D.';
    setMode(false, { persist: false });
  });
  canvas.addEventListener('webglcontextrestored', () => {
    fallbackReason = '';
    window.NRTS_3D_SOURCE?.setStatus?.('WebGL-context hersteld. 3D kan opnieuw worden ingeschakeld.');
  });

  let resume3d = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resume3d = api.enabled();
      if (resume3d) api.setEnabled(false);
      return;
    }
    if (resume3d) {
      api.setEnabled(true);
      document.documentElement.dataset.renderMode = '3d';
      resume3d = false;
    }
  });

  window.__BATTLEFIELD_3D_EXPERIENCE_V1__ = Object.freeze({
    version: 'battlefield-3d-experience-v1',
    shortcut: 'Alt+3',
    persistentMode: true,
    webglFallback: true,
    hiddenTabSuspension: true,
    mode: () => api.enabled() ? '3d' : '2d',
    fallbackReason: () => fallbackReason,
    diagnostics: () => api.diagnostics()
  });

  document.documentElement.dataset.renderMode = api.enabled() ? '3d' : '2d';

  import('./battlefield-3d-unit-detail-v1.mjs?build=graphics6').catch(error => {
    console.warn('3D unit detail layer failed to load', error);
  });
}
