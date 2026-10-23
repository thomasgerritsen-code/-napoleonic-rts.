'use strict';
// Weather (open map only, NRTS_CONFIG.weather): clear, overcast, rain and fog
// follow each other over the battle. Rain soaks the ground (wetness rises,
// and dries off slowly afterwards); wet powder misfires, men and horses tread
// slower in the mud; fog and rain shorten sight. The iso view draws the rain,
// the haze, the darkened wet ground with puddles and the tracks men, horses
// and guns leave in it.
(function installWeatherV1(root) {
  const cfg = root.NRTS_CONFIG?.weather;
  if (!cfg) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installWeatherV1(root), { once: true }); return; }
  if (root.__WEATHER_V1__ || typeof fire !== 'function') return;
  const KINDS = {
    clear: { label: 'Helder', icon: '☀', sight: 1, rain: 0, fog: 0, dark: 0 },
    overcast: { label: 'Bewolkt', icon: '☁', sight: 0.95, rain: 0, fog: 0, dark: 0.12 },
    rain: { label: 'Regen', icon: '🌧', sight: 0.8, rain: 1, fog: 0.15, dark: 0.22 },
    fog: { label: 'Mist', icon: '🌫', sight: 0.55, rain: 0, fog: 1, dark: 0.08 }
  };
  // What may follow what (weighted), so rain comes out of cloud and clears through it.
  const NEXT = { clear: { clear: 2, overcast: 3, fog: 1 }, overcast: { clear: 2, rain: 3, overcast: 1, fog: 1 },
    rain: { overcast: 3, rain: 1 }, fog: { clear: 2, overcast: 2 } };
  const st = { kind: cfg.start || 'clear', from: cfg.start || 'clear', blend: 1, until: cfg.minSpell, wetness: 0, misfires: 0, changes: 0, forced: false };
  const rng = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  function pick(table) {
    const total = Object.values(table).reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (const [k, w] of Object.entries(table)) { if ((r -= w) <= 0) return k; }
    return Object.keys(table)[0];
  }
  function set(kind, hold = null) {
    if (!KINDS[kind]) return false;
    st.from = st.kind; st.kind = kind; st.blend = 0; st.changes++;
    st.until = elapsed + (hold ?? (cfg.minSpell + rng() * (cfg.maxSpell - cfg.minSpell)));
    st.forced = hold != null;
    label();
    return true;
  }
  // Blended amount of a quality (rain, fog, dark, sight) while one weather turns into the next.
  const mix = key => KINDS[st.from][key] * (1 - st.blend) + KINDS[st.kind][key] * st.blend;
  function step(dt) {
    if (elapsed >= st.until && !gameOver) set(pick(NEXT[st.kind] || NEXT.clear));
    st.blend = Math.min(1, st.blend + dt / cfg.turnSeconds);
    const raining = mix('rain');
    st.wetness = raining > 0.2 ? Math.min(1, st.wetness + dt / cfg.soakSeconds * raining) : Math.max(0, st.wetness - dt / cfg.drySeconds);
  }
  const baseUpdateBuildings = updateBuildings;
  updateBuildings = function updateBuildingsWithWeather(dt) { const r = baseUpdateBuildings(dt); step(dt); return r; };

  // ---- effects ----
  // Damp powder: muskets misfire in the rain (the man still has to clear and reload).
  const baseFire = fire;
  fire = function fireInWeather(unit, enemy) {
    if ((unit.type === 'infantry' || unit.type === 'officer') && mix('rain') > 0.3 && rng() < cfg.misfire * mix('rain')) {
      st.misfires++;
      unit.reload = (TYPES[unit.type]?.reload || 3) * (0.8 + rng() * 0.3);
      unit.misfiredAt = elapsed;
      return;
    }
    return baseFire(unit, enemy);
  };
  if (typeof visionRadius === 'function') {
    const base = visionRadius;
    visionRadius = function visionRadiusInWeather(e) { return base(e) * mix('sight'); };
  }
  // Mud: everyone treads slower on soaked ground.
  if (typeof moveToward === 'function') {
    const base = moveToward;
    moveToward = function moveTowardInMud(u, tx, ty, dt, speed) {
      const slow = 1 - (u?.type === 'artillery' ? cfg.mudSlowGuns : cfg.mudSlow) * st.wetness;
      return arguments.length >= 5 ? base(u, tx, ty, dt * slow, speed) : base(u, tx, ty, dt * slow);
    };
  }

  // ---- the weather in the top bar, next to the wind ----
  const tag = document.createElement('span');
  tag.id = 'weather-indicator';
  tag.style.cssText = 'display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:5px 8px;white-space:nowrap;pointer-events:none;user-select:none;opacity:.92';
  (document.getElementById('topdown-wind-direction-v267') || document.getElementById('resetBtn'))?.insertAdjacentElement('afterend', tag);
  function label() {
    const k = KINDS[st.kind];
    tag.textContent = `${k.icon} ${k.label}${st.wetness > 0.35 ? ' · nat' : ''}`;
    tag.title = st.kind === 'rain' ? 'Regen: musketten ketsen vaker, modder vertraagt, minder zicht' : st.kind === 'fog' ? 'Mist: veel minder zicht' : 'Weer';
  }
  let labelAt = 0;
  const baseHud = updateHud;
  updateHud = function updateHudWithWeather(...args) { const r = baseHud.apply(this, args); if (elapsed - labelAt > 1 || elapsed < labelAt) { labelAt = elapsed; label(); } return r; };
  if (typeof resetGame === 'function') {
    const base = resetGame;
    resetGame = function resetGameWithWeather(...args) { st.kind = st.from = cfg.start || 'clear'; st.blend = 1; st.until = cfg.minSpell; st.wetness = 0; return base(...args); };
  }
  label();

  root.__WEATHER_V1__ = Object.freeze({
    version: '1.0', config: cfg, kinds: Object.keys(KINDS), set, mix, label: () => KINDS[st.kind].label,
    state: () => ({ kind: st.kind, from: st.from, blend: st.blend, wetness: st.wetness, rain: mix('rain'), fog: mix('fog'), dark: mix('dark'), sight: mix('sight'), until: st.until }),
    setWetness: w => { st.wetness = Math.max(0, Math.min(1, w)); },
    stats: () => ({ misfires: st.misfires, changes: st.changes })
  });
})(window);
