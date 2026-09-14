// v1.3.7: non-invasive 3D experience hardening around the public renderer API.
const api = window.__BATTLEFIELD_3D_V1__;
const canvas = document.getElementById('battlefield3d');
const modeButton = document.getElementById('renderModeBtn');

if (!api || !canvas || !modeButton) {
  console.warn('3D experience layer skipped: renderer API not ready.');
} else {
  const STORAGE_KEY = 'nrts-render-mode';
  const VISUAL_BUILD = 'graphics15';
  let fallbackReason = '';
  let visualLayersImportStarted = false;
  let visualLayersReady = 0;
  let visualLayersFailed = 0;
  let deferredBatches = 0;
  let deferredWaits = 0;

  const essentialVisualLayers = [
    ['./battlefield-3d-unit-detail-v1.mjs', '3D unit detail layer'],
    ['./battlefield-3d-selection-feedback-v1.mjs', '3D selection feedback layer']
  ];
  const cosmeticVisualLayers = [
    ['./battlefield-3d-combat-feedback-v1.mjs', '3D combat feedback layer'],
    ['./battlefield-3d-salvo-polish-v1.mjs', '3D salvo polish layer'],
    ['./battlefield-3d-volley-readability-v1.mjs', '3D volley readability layer'],
    ['./battlefield-3d-regiment-polish-v1.mjs', '3D regiment polish layer'],
    ['./battlefield-3d-regimental-identity-v1.mjs', '3D regimental identity layer']
  ];

  function importVisualLayer(path, label) {
    return import(`${path}?build=${VISUAL_BUILD}`).then(() => {
      visualLayersReady++;
    }).catch(error => {
      visualLayersFailed++;
      console.warn(`${label} failed to load`, error);
    });
  }

  function scheduleDeferred(callback) {
    deferredBatches++;
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(callback, { timeout: 220 });
      return;
    }
    requestAnimationFrame(() => setTimeout(callback, 0));
  }

  function importCosmeticLayers(index = 0) {
    if (index >= cosmeticVisualLayers.length) return;
    if (!api.enabled() || document.hidden) {
      deferredWaits++;
      setTimeout(() => importCosmeticLayers(index), 180);
      return;
    }
    const [path, label] = cosmeticVisualLayers[index];
    importVisualLayer(path, label).finally(() => {
      scheduleDeferred(() => importCosmeticLayers(index + 1));
    });
  }

  function importVisualLayersWhenReady() {
    if (visualLayersImportStarted) return;
    if (!window.NRTS_3D_SOURCE || !window.__NRTS_THREE_SCENE_HOOK_V1__) {
      requestAnimationFrame(importVisualLayersWhenReady);
      return;
    }
    if (!api.enabled() || document.hidden) {
      deferredWaits++;
      setTimeout(importVisualLayersWhenReady, 180);
      return;
    }
    visualLayersImportStarted = true;
    Promise.all(essentialVisualLayers.map(([path, label]) => importVisualLayer(path, label)))
      .finally(() => scheduleDeferred(() => importCosmeticLayers(0)));
  }

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
    if (enabled) importVisualLayersWhenReady();
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
      importVisualLayersWhenReady();
    }
  });

  window.__BATTLEFIELD_3D_EXPERIENCE_V1__ = Object.freeze({
    version: 'battlefield-3d-experience-v1',
    shortcut: 'Alt+3',
    persistentMode: true,
    webglFallback: true,
    hiddenTabSuspension: true,
    visualBuild: VISUAL_BUILD,
    stagedVisualLoading: true,
    mode: () => api.enabled() ? '3d' : '2d',
    fallbackReason: () => fallbackReason,
    diagnostics: () => ({
      ...api.diagnostics(),
      visualLayersImportStarted,
      visualLayersReady,
      visualLayersFailed,
      visualLayerCount: essentialVisualLayers.length + cosmeticVisualLayers.length,
      deferredBatches,
      deferredWaits
    })
  });

  document.documentElement.dataset.renderMode = api.enabled() ? '3d' : '2d';
  importVisualLayersWhenReady();
}
