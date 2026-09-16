(function installPreviewTelemetry(global) {
  'use strict';

  const STORAGE_KEY = 'nrts-telemetry-preview';
  const PH_KEY = 'phc_uAtXDYjmNXJNYXwvMCRR6f72iMLRXr3kYb3GM6hgBDaq';
  const PH_HOST = 'https://eu.i.posthog.com';
  const SCRIPT_URL = 'https://eu-assets.i.posthog.com/static/array.js';

  const EVENT_PROPERTIES = Object.freeze({
    rts_game_loaded: ['environment', 'version', 'renderer', 'viewportClass'],
    rts_battle_started: ['scenario', 'seed', 'renderer', 'unitCountBucket'],
    rts_order_issued: ['orderType', 'regimentCount', 'formation', 'phase'],
    rts_renderer_switched: ['from', 'to', 'fallback'],
    rts_regiment_stall: ['phase', 'durationBucket', 'terrainContext'],
    rts_bridge_crossing_completed: ['durationBucket', 'unitCountBucket', 'maxStallBucket'],
    rts_deploy_started: ['formation', 'phase'],
    rts_deploy_completed: ['formation', 'durationBucket'],
    rts_first_attack: ['role', 'timeFromApproachBucket'],
    rts_target_switched: ['role', 'phase', 'switchCountBucket'],
    rts_battle_ended: ['durationBucket', 'outcome', 'friendlyRemainingBucket', 'enemyRemainingBucket'],
    rts_runtime_error: ['errorClass', 'module'],
    rts_performance_sample: ['renderer', 'frameP95Bucket', 'updateP95Bucket', 'drawP95Bucket', 'unitCountBucket', 'viewportClass']
  });

  let loading = false;
  let booted = false;

  function environment() {
    const host = global.location?.hostname || '';
    if (host === 'napoleonic-rts.vercel.app') return 'production';
    if (host.endsWith('.vercel.app')) return 'preview';
    return 'development';
  }

  function viewportClass() {
    const width = global.innerWidth || 0;
    const height = global.innerHeight || 0;
    const shortSide = Math.min(width, height);
    if (shortSide <= 480) return 'phone';
    if (shortSide <= 900) return 'tablet';
    return 'desktop';
  }

  function requestedByUrl() {
    const params = new URLSearchParams(global.location?.search || '');
    if (params.get('telemetry') === '1') {
      try { global.localStorage?.setItem(STORAGE_KEY, '1'); } catch (_) {}
      return true;
    }
    if (params.get('telemetry') === '0') {
      try { global.localStorage?.removeItem(STORAGE_KEY); } catch (_) {}
      return false;
    }
    try { return global.localStorage?.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }

  function enabled() {
    return environment() !== 'production' && requestedByUrl();
  }

  function sanitize(event, properties) {
    const allowed = EVENT_PROPERTIES[event];
    if (!allowed) return null;
    const safe = {};
    for (const key of allowed) {
      const value = properties?.[key];
      if (value == null) continue;
      if (typeof value === 'string') safe[key] = value.slice(0, 80);
      else if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
      else if (typeof value === 'boolean') safe[key] = value;
    }
    return safe;
  }

  function capture(event, properties) {
    if (!enabled()) return false;
    const safe = sanitize(event, properties);
    if (!safe) return false;
    if (!global.posthog || typeof global.posthog.capture !== 'function') return false;
    global.posthog.capture(event, safe);
    return true;
  }

  function boot() {
    if (!enabled() || loading || booted) return;
    loading = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = SCRIPT_URL;
    script.dataset.nrtsTelemetry = 'preview-v1';
    script.onload = function () {
      loading = false;
      if (!global.posthog || typeof global.posthog.init !== 'function') return;
      global.posthog.init(PH_KEY, {
        api_host: PH_HOST,
        defaults: '2025-05-24',
        person_profiles: 'identified_only',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        disable_session_recording: true,
        loaded: function () {
          booted = true;
          capture('rts_game_loaded', {
            environment: environment(),
            version: global.RTS_VERSION_INFO?.version || document.querySelector('.version')?.textContent || 'unknown',
            renderer: global.__NRTS_PIXI_V1__ ? 'pixi' : global.__BATTLEFIELD_3D_V1__?.enabled?.() ? 'three' : '2d',
            viewportClass: viewportClass()
          });
        }
      });
    };
    script.onerror = function () { loading = false; };
    document.head.appendChild(script);
  }

  const api = Object.freeze({
    version: 'telemetry-preview-v1',
    environment,
    viewportClass,
    enabled,
    boot,
    capture,
    setEnabled(value) {
      if (environment() === 'production') return false;
      try {
        if (value) global.localStorage?.setItem(STORAGE_KEY, '1');
        else global.localStorage?.removeItem(STORAGE_KEY);
      } catch (_) {}
      if (value) boot();
      return enabled();
    }
  });

  global.RTSTelemetry = api;
  global.__RTS_TELEMETRY_PREVIEW_V1__ = api;
  boot();
}(window));
