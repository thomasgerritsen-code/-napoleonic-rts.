'use strict';
// A deterministic visual clock for the isometric battle. No wall-clock timers,
// simulation writes, gameplay randomness or changes to sight/combat rules.
(function installDayNight(root) {
  const config = root.NRTS_CONFIG?.dayNight;
  if (!config || root.__DAY_NIGHT_V1__) return;
  const names = { morning: ['Ochtend', '🌅'], day: ['Dag', '☀'], evening: ['Avond', '🌇'], night: ['Nacht', '🌙'] };
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function at(seconds) {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hour = (config.startHour + time % config.cycleSeconds * 24 / config.cycleSeconds) % 24;
    const sunrise = smooth(5, 8, hour), sunset = smooth(17, 20, hour);
    const night = 1 - sunrise * (1 - sunset);
    const warmth = Math.max(4 * sunrise * (1 - sunrise), 4 * sunset * (1 - sunset));
    // Compose warm twilight and blue moonlight into one source-over rectangle.
    const blue = night * config.nightOpacity, amber = warmth * config.twilightOpacity;
    const alpha = blue + amber * (1 - blue);
    const channel = (moon, sun) => Math.round((moon * blue + sun * amber * (1 - blue)) / alpha);
    const tint = alpha > 0.0001 ? `rgba(${channel(12,240)},${channel(25,150)},${channel(58,70)},${alpha})` : null;
    const phase = hour < 5 || hour >= 20 ? 'night' : hour < 8 ? 'morning' : hour < 17 ? 'day' : 'evening';
    const minute = Math.floor(hour * 60 + 1e-8) % 1440;
    return Object.freeze({ hour, phase, label: names[phase][0], icon: names[phase][1],
      clock: `${String(Math.floor(minute / 60)).padStart(2,'0')}:${String(minute % 60).padStart(2,'0')}`,
      day: Math.floor((config.startHour + time * 24 / config.cycleSeconds) / 24) + 1,
      daylight: 1 - night, night, warmth, alpha, tint });
  }
  let cachedAt, cached;
  function state() {
    const time = typeof elapsed === 'number' ? elapsed : 0;
    if (!cached || time !== cachedAt) { cachedAt = time; cached = at(time); }
    return cached;
  }
  let badge = null, clockLabel = null, seasonLabel = null, lastLabel = '';
  function refresh() {
    if (!badge) return;
    const s = state(), season = root.__SEASONS_V1__?.state(), text = `${s.icon} ${s.label} ${s.clock}`, key = `${s.day}|${text}|${season?.key}|${season?.year}`;
    if (key !== lastLabel) {
      lastLabel = key; clockLabel.textContent = text;
      seasonLabel.textContent = season ? `${season.icon} ${season.label}` : '';
      seasonLabel.hidden = !season; badge.dataset.season = season?.key || '';
      badge.setAttribute('aria-label', `Dag ${s.day}, ${s.label.toLowerCase()}, ${s.clock}${season?`, ${season.label}, jaar ${season.year}`:''}`);
      badge.title = `Dag ${s.day} · ${s.clock} · ${s.label}${season?` · ${season.label}, jaar ${season.year}`:''}`;
      badge.dataset.phase = s.phase;
    }
  }
  function boot() {
    badge = document.createElement('span'); badge.id = 'day-night-indicator';
    clockLabel = document.createElement('span'); seasonLabel = document.createElement('span');
    seasonLabel.className = 'season-label'; badge.append(clockLabel,seasonLabel);
    const style = document.createElement('style');
    style.textContent = `#day-night-indicator{display:inline-block;white-space:nowrap;margin-left:8px;padding:4px 7px;border:1px solid rgba(245,241,232,.18);border-radius:7px;background:rgba(16,20,17,.86);color:#f5f1e8;font:600 12px/1.35 system-ui,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none;user-select:none}
      #day-night-indicator .season-label{margin-left:7px}#day-night-indicator .season-label[hidden]{display:none}
      @media(max-width:860px),(pointer:coarse){#day-night-indicator{position:fixed;z-index:19;left:max(10px,env(safe-area-inset-left));top:calc(max(4px,env(safe-area-inset-top)) + 54px);margin:0;padding:5px 8px}#day-night-indicator .season-label{display:block;margin:2px 0 0;font-size:11px;line-height:1.1}body.mobile-menu-open #day-night-indicator{top:calc(max(4px,env(safe-area-inset-top)) + 104px)}}`;
    document.head.appendChild(style);
    const mobile = root.matchMedia('(max-width:860px),(pointer:coarse)');
    const place = () => (mobile.matches ? document.body : document.querySelector('.brand') || document.body).appendChild(badge);
    place(); mobile.addEventListener('change', place);
    if (typeof updateHud === 'function') {
      const base = updateHud;
      updateHud = function updateHudWithDayNight(...args) { const result = base.apply(this,args); refresh(); return result; };
    }
    root.NRTS?.events?.on?.('game:reset', () => { cached = null; lastLabel = ''; refresh(); });
    refresh();
  }
  root.__DAY_NIGHT_V1__ = Object.freeze({ version: '1.0', config, at, state, refresh });
  if (document.readyState === 'complete') boot(); else root.addEventListener('load', boot, { once: true });
})(window);
