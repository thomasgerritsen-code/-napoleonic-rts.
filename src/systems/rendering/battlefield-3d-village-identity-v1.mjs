// v1.3.7: lightweight archetype identity layer for the 3D battlefield.
const source = window.NRTS_3D_SOURCE;
const rendererApi = window.__BATTLEFIELD_3D_V1__;

if (!source || !rendererApi) {
  console.warn('3D village identity layer skipped: battlefield API not ready.');
} else {
  const STORAGE_KEY = 'nrts-3d-village-identity-collapsed';
  const ARCHETYPES = Object.freeze({
    parish: { label: 'Parish centre', icon: '⛪', accent: '#d6c48e', hint: 'Dorpsgroen, kapel en centrale bebouwing' },
    'parish-centre': { label: 'Parish centre', icon: '⛪', accent: '#d6c48e', hint: 'Dorpsgroen, kapel en centrale bebouwing' },
    ribbon: { label: 'Lintdorp', icon: '↔', accent: '#b8c995', hint: 'Lineaire bebouwing langs de doorgaande weg' },
    'ribbon-village': { label: 'Lintdorp', icon: '↔', accent: '#b8c995', hint: 'Lineaire bebouwing langs de doorgaande weg' },
    agrarian: { label: 'Agrarisch dorp', icon: '🌾', accent: '#c9ad73', hint: 'Boerderijen, schuren en erven domineren' },
    woodland: { label: 'Bosranddorp', icon: '🌲', accent: '#789474', hint: 'Compacte bebouwing tegen de bosrand' },
    crossroads: { label: 'Kruispuntdorp', icon: '✣', accent: '#b7a68f', hint: 'Bebouwing rond een verkeersknooppunt' }
  });

  const normalize = value => {
    const key = String(value || 'crossroads').toLowerCase().trim();
    if (ARCHETYPES[key]) return key;
    if (key.includes('parish')) return 'parish';
    if (key.includes('ribbon')) return 'ribbon';
    if (key.includes('agrar')) return 'agrarian';
    if (key.includes('wood')) return 'woodland';
    return 'crossroads';
  };

  const world = source.staticWorld();
  const villages = (world.villages || []).map((village, index) => ({
    index,
    name: village.name || `Dorp ${index + 1}`,
    archetype: normalize(village.archetype),
    junctionRoadCount: village.junctionRoadCount || 0,
    houses: village.houses || []
  }));

  const counts = villages.reduce((map, village) => {
    map[village.archetype] = (map[village.archetype] || 0) + 1;
    return map;
  }, {});
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'crossroads';
  const landmarks = villages.reduce((acc, village) => {
    for (const house of village.houses) {
      if (house.kind === 'chapel') acc.chapels++;
      if (house.kind === 'inn') acc.inns++;
      if (house.kind === 'barn') acc.barns++;
    }
    return acc;
  }, { chapels: 0, inns: 0, barns: 0 });

  const style = document.createElement('style');
  style.textContent = `
    .village-identity-3d{position:fixed;right:16px;top:92px;z-index:28;width:min(320px,calc(100vw - 32px));background:rgba(20,25,21,.88);border:1px solid rgba(236,224,188,.22);border-radius:12px;color:#eee7d8;box-shadow:0 10px 28px rgba(0,0,0,.28);backdrop-filter:blur(6px);font:12px/1.35 system-ui,sans-serif;transition:opacity .18s ease,transform .18s ease}
    .village-identity-3d[data-hidden="true"]{opacity:0;pointer-events:none;transform:translateY(-6px)}
    .village-identity-3d .vi-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
    .village-identity-3d .vi-head strong{font-size:12px;letter-spacing:.02em}.village-identity-3d button{font:inherit;color:#ddd3bd;background:transparent;border:0;cursor:pointer;padding:3px 6px}
    .village-identity-3d .vi-body{padding:9px 10px}.village-identity-3d.collapsed .vi-body{display:none}
    .village-identity-3d .vi-summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:7px;color:#cfc5b3}.village-identity-3d .vi-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
    .village-identity-3d .vi-types{display:grid;grid-template-columns:1fr 1fr;gap:6px}.village-identity-3d .vi-type{padding:6px 7px;border-left:3px solid var(--accent);background:rgba(255,255,255,.035);border-radius:5px}.village-identity-3d .vi-type b{display:block;font-size:11px}.village-identity-3d .vi-type span{color:#bfb6a6;font-size:10px}
    .village-identity-3d .vi-footer{margin-top:7px;color:#9f978b;font-size:10px}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.id = 'villageIdentity3d';
  panel.className = 'village-identity-3d';
  panel.dataset.version = 'v1';
  panel.setAttribute('aria-label', '3D dorpsidentiteit');
  panel.innerHTML = `
    <div class="vi-head"><strong>3D dorpskarakter</strong><button type="button" aria-label="Inklappen" title="Alt+V">−</button></div>
    <div class="vi-body">
      <div class="vi-summary">
        <span class="vi-chip">🏘️ ${villages.length} dorpen</span>
        <span class="vi-chip">⛪ ${landmarks.chapels}</span>
        <span class="vi-chip">🍺 ${landmarks.inns}</span>
        <span class="vi-chip">🌾 ${landmarks.barns}</span>
      </div>
      <div class="vi-types"></div>
      <div class="vi-footer">Dominant: ${ARCHETYPES[dominant].label} · Alt+V toont/verbergt dit overzicht.</div>
    </div>`;

  const types = panel.querySelector('.vi-types');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
    const profile = ARCHETYPES[key];
    const item = document.createElement('div');
    item.className = 'vi-type';
    item.style.setProperty('--accent', profile.accent);
    item.innerHTML = `<b>${profile.icon} ${profile.label} · ${count}</b><span>${profile.hint}</span>`;
    types.appendChild(item);
  });
  document.body.appendChild(panel);

  let collapsed = false;
  try { collapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}
  const syncCollapsed = () => {
    panel.classList.toggle('collapsed', collapsed);
    panel.querySelector('button').textContent = collapsed ? '+' : '−';
    panel.querySelector('button').setAttribute('aria-label', collapsed ? 'Uitklappen' : 'Inklappen');
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (_) {}
  };
  syncCollapsed();

  panel.querySelector('button').addEventListener('click', () => {
    collapsed = !collapsed;
    syncCollapsed();
  });
  window.addEventListener('keydown', event => {
    if (!(event.altKey && event.code === 'KeyV') || event.repeat) return;
    event.preventDefault();
    collapsed = !collapsed;
    syncCollapsed();
  });

  const syncVisibility = () => {
    panel.dataset.hidden = rendererApi.enabled() ? 'false' : 'true';
  };
  syncVisibility();
  const observer = new MutationObserver(syncVisibility);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-render-mode'] });

  window.__BATTLEFIELD_3D_VILLAGE_IDENTITY_V1__ = Object.freeze({
    version: 'battlefield-3d-village-identity-v1',
    archetypes: Object.keys(counts),
    counts: { ...counts },
    dominant,
    landmarks: { ...landmarks },
    villages: villages.length,
    collapsed: () => collapsed,
    visible: () => rendererApi.enabled()
  });
}
