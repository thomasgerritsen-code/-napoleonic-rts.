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
  // Dry spells vary; scheduled showers gather cloud first and clear through it.
  const NEXT = { clear: { clear: 2, overcast: 3, fog: 1 }, overcast: { clear: 2, overcast: 1, fog: 1 },
    rain: { overcast: 1 }, fog: { clear: 2, overcast: 2 } };
  // A maximum dry interval ensures showers actually arrive during a battle.
  // Weather and powder use separate deterministic streams, so firing cannot
  // delay a shower. A new battle starts the same weather schedule afresh.
  const initial = () => ({ kind: cfg.start || 'clear', from: cfg.start || 'clear', blend: 1,
    until: cfg.minSpell, nextRainAt: cfg.firstRainSeconds, wetness: 0, misfires: 0, changes: 0, forced: false });
  const st = initial();
  let weatherSeed = 12345, powderSeed = 67890;
  const rng = () => (weatherSeed = weatherSeed * 16807 % 2147483647) / 2147483647;
  const powderRandom = () => (powderSeed = powderSeed * 16807 % 2147483647) / 2147483647;
  function pick(table) {
    const total = Object.values(table).reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (const [k, w] of Object.entries(table)) { if ((r -= w) <= 0) return k; }
    return Object.keys(table)[0];
  }
  function change(kind, hold = null, forced = false) {
    if (!KINDS[kind]) return false;
    st.from = st.kind; st.kind = kind; st.blend = 0; st.changes++;
    root.__VISION_EPOCH__ = (root.__VISION_EPOCH__ || 0) + 1;   // sight changes: cached vision is stale
    const duration = kind === 'rain'
      ? cfg.rainMinSeconds + rng() * (cfg.rainMaxSeconds - cfg.rainMinSeconds)
      : cfg.minSpell + rng() * (cfg.maxSpell - cfg.minSpell);
    st.until = elapsed + (hold ?? duration);
    st.forced = forced;
    if (kind === 'rain') st.nextRainAt = st.until + cfg.dryMinSeconds + rng() * (cfg.dryMaxSeconds - cfg.dryMinSeconds);
    label();
    return true;
  }
  const set = (kind, hold = null) => change(kind, hold, hold != null);
  // Blended amount of a quality (rain, fog, dark, sight) while one weather turns into the next.
  const mix = key => KINDS[st.from][key] * (1 - st.blend) + KINDS[st.kind][key] * st.blend;
  function step(dt) {
    if (!gameOver && (!st.forced || elapsed >= st.until)) {
      st.forced = false;
      if (elapsed >= st.nextRainAt) change('rain');
      else if (st.kind !== 'rain' && elapsed >= st.nextRainAt - cfg.cloudLeadSeconds) {
        if (st.kind !== 'overcast') change('overcast', st.nextRainAt - elapsed);
        else st.until = Math.max(st.until, st.nextRainAt);
      } else if (elapsed >= st.until) {
        // Rain waits for its due time; every shower has a proper dry interval.
        change(pick(NEXT[st.kind] || NEXT.clear));
      }
    }
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
    if ((unit.type === 'infantry' || unit.type === 'officer') && mix('rain') > 0.3 && powderRandom() < cfg.misfire * mix('rain')) {
      st.misfires++;
      unit.reload = (TYPES[unit.type]?.reload || 3) * (0.8 + powderRandom() * 0.3);
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
    const snow = st.kind === 'rain' && (root.__SEASONS_V1__?.state().snow || 0) > .5;
    tag.textContent = `${snow?'🌨':k.icon} ${snow?'Sneeuw':k.label}${st.wetness > 0.35 ? ' · nat' : ''}`;
    tag.title = snow ? 'Sneeuw: nat kruit, zware grond en minder zicht' : st.kind === 'rain' ? 'Regen: musketten ketsen vaker, modder vertraagt, minder zicht' : st.kind === 'fog' ? 'Mist: veel minder zicht' : 'Weer';
  }
  let labelAt = 0;
  const baseHud = updateHud;
  updateHud = function updateHudWithWeather(...args) { const r = baseHud.apply(this, args); if (elapsed - labelAt > 1 || elapsed < labelAt) { labelAt = elapsed; label(); } return r; };
  if (typeof resetGame === 'function') {
    const base = resetGame;
    resetGame = function resetGameWithWeather(...args) { Object.assign(st, initial()); weatherSeed = 12345; powderSeed = 67890; labelAt = 0; const r = base(...args); label(); return r; };
  }
  label();

  root.__WEATHER_V1__ = Object.freeze({
    version: '1.1', config: cfg, kinds: Object.keys(KINDS), set, mix, label: () => KINDS[st.kind].label,
    state: () => ({ kind: st.kind, from: st.from, blend: st.blend, wetness: st.wetness, rain: mix('rain'), fog: mix('fog'), dark: mix('dark'), sight: mix('sight'), until: st.until, nextRainAt: st.nextRainAt }),
    setWetness: w => { st.wetness = Math.max(0, Math.min(1, w)); },
    stats: () => ({ misfires: st.misfires, changes: st.changes })
  });
})(window);
