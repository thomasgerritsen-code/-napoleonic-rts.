(function () {
  'use strict';

  const PH_KEY = 'phc_uAtXDYjmNXJNYXwvMCRR6f72iMLRXr3kYb3GM6hgBDaq';
  const PH_HOST = 'https://eu.i.posthog.com';
  const SCRIPT = 'https://eu-assets.i.posthog.com/static/array.js';

  function environment() {
    const host = location.hostname;
    if (host === 'napoleonic-rts.vercel.app') return 'production';
    if (host.endsWith('.vercel.app')) return 'preview';
    return 'development';
  }

  function boot() {
    if (window.posthog || window.__RTS_POSTHOG_BOOTED__) return;
    window.__RTS_POSTHOG_BOOTED__ = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = SCRIPT;
    s.onload = function () {
      if (!window.posthog || typeof window.posthog.init !== 'function') return;
      window.posthog.init(PH_KEY, {
        api_host: PH_HOST,
        defaults: '2025-05-24',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        capture_exceptions: true,
        capture_performance: { web_vitals: true },
        autocapture: false,
        disable_session_recording: true,
        loaded: function (ph) {
          ph.register({
            rts_environment: environment(),
            rts_version: window.RTS_VERSION_INFO?.version || document.querySelector('.version')?.textContent || 'unknown',
            rts_host: location.hostname
          });
          ph.capture('rts_game_loaded');
        }
      });
    };
    document.head.appendChild(s);
  }

  window.RTSTelemetry = {
    capture: function (event, properties) {
      if (!window.posthog || typeof window.posthog.capture !== 'function') return false;
      window.posthog.capture(event, properties || {});
      return true;
    },
    environment
  };

  boot();
}());
