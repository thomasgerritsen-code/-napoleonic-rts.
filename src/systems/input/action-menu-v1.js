'use strict';
// Action menu (open map only, NRTS_CONFIG.actionMenu): the bottom bar shows
// only what fits the selection, in labelled groups and a fixed order -
// peasants get Bouwen and Werk, soldiers get Bevel, Formatie and Regiment, a
// building gets Productie - instead of every button at once. The buttons stay
// the game's own (same actions, same handlers); this only sorts, labels and
// hides them, with CSS order so no other module's DOM work is disturbed.
(function installActionMenuV1(root) {
  if (!root.NRTS_CONFIG?.actionMenu || root.__ACTION_MENU_V1__ || typeof actionsEl === 'undefined') return;
  const GROUPS = [
    { id: 'bevel', label: '⚔ Bevel', show: c => c.army },
    { id: 'formatie', label: '▦ Formatie', show: c => c.army },
    { id: 'regiment', label: '🎖 Regiment', show: c => c.army },
    { id: 'productie', label: '🏭 Productie', show: c => c.building },
    { id: 'werk', label: '🌾 Werk', show: c => c.workers },
    { id: 'bouwen', label: '🔨 Bouwen', show: c => c.workers },
    { id: 'overig', label: '', show: () => true }
  ];
  const ACTION_GROUP = {
    'assign-officer': 'regiment', 'quick-cavalry-stable': 'productie', 'train-cavalry-missing': 'productie',
    halt: 'bevel', bayonet: 'bevel', charge: 'bevel', 'artillery-mode': 'bevel', 'defend-stance': 'bevel', 'trench-upgrade': 'bevel',
    'rotate-left': 'formatie', 'rotate-right': 'formatie', skirmish: 'formatie',
    'create-regiment': 'regiment', 'reinforce-regiment': 'regiment', 'select-nearby-infantry': 'regiment', 'add-nearest-regiment': 'regiment',
    'toggle-regiment-tap-selection': 'regiment', 'create-cavalry-regiment': 'regiment', 'create-battery': 'regiment', 'crew-gun': 'regiment',
    'farm-assign': 'werk', 'mine-assign': 'werk', 'lumber-assign': 'werk', 'resume-construction': 'werk', 'set-rally': 'productie', 'tower-upgrade': 'productie',
    'quick-regiment': 'regiment', 'quick-regiment-barracks': 'productie', 'train-missing': 'productie', 'auto-regiment': 'productie'
  };
  function groupOf(el) {
    if (el.dataset.formation) return 'formatie';
    const a = el.dataset.action || '';
    if (ACTION_GROUP[a]) return ACTION_GROUP[a];
    if (a.startsWith('build-')) return 'bouwen';
    if (a.startsWith('train-')) return 'productie';
    return 'overig';
  }
  // Order inside a group: the main choices first (formations, training,
  // standing orders), then the finer ones.
  const RANK = { line: 1, column: 2, square: 3, skirmish: 4, 'rotate-left': 6, 'rotate-right': 7, halt: 1, bayonet: 2, charge: 2, 'artillery-mode': 3,
    'defend-stance': 4, 'trench-upgrade': 5, 'create-cavalry-regiment': 0, 'quick-cavalry-stable': 0, 'train-cavalry-missing': 1, 'create-regiment': 1, 'quick-regiment': 0, 'reinforce-regiment': 2, 'quick-regiment-barracks': 5, 'train-missing': 6, 'auto-regiment': 7, 'set-rally': 9, 'farm-assign': 1, 'resume-construction': 2,
    'build-house': 1, 'build-farm': 2, 'build-barracks': 3, 'build-tower': 4, 'build-stable': 5, 'build-foundry': 6 };
  const rank = el => 10 + (RANK[el.dataset.formation || el.dataset.action] ?? (el.dataset.action?.startsWith('train-') ? 0 : 8));
  function context() {
    const sel = [...selectedUnits].filter(u => !u.dead && u.side === 'france');
    const b = typeof selectedBuilding !== 'undefined' ? selectedBuilding : null;
    return {
      workers: sel.some(u => u.type === 'worker'),
      army: sel.some(u => u.type !== 'worker'),
      cavalryDraft: sel.some(u => !u.regimentId && (u.type === 'cavalry' || (u.type === 'officer' && u.troop === 'mounted'))),
      selectionKey: `${b?.id||''}|${sel.map(u=>u.id).sort((a,b)=>a-b).join(',')}`,
      building: !!(b && !b.dead && b.side === 'france'),
      any: sel.length > 0 || !!(b && !b.dead)
    };
  }
  const style = document.createElement('style');
  style.textContent = `
    .actions .menu-hidden{display:none!important}
    .actions .menu-label{display:flex;align-items:center;flex:0 0 auto;padding:0 6px 0 10px;margin-left:4px;border-left:1px solid rgba(245,241,232,.22);
      color:#f4d86d;font:700 .62rem/1.1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;pointer-events:none}
    .actions .menu-label:first-child,.actions .menu-label.first{border-left:0;margin-left:0;padding-left:2px}
    .actions .menu-hint{display:flex;align-items:center;padding:0 10px;color:rgba(245,241,232,.75);font:600 .72rem/1.3 system-ui,sans-serif;white-space:normal;max-width:420px}
    /* Napoleonic look: dark lacquered wood, a brass edge, a serif face, an
       icon over each label and a coloured cap per group. */
    .actions.menu-v1{--brass:#c9a254;--wood1:#3b3227;--wood2:#231d16}
    .actions.menu-v1 button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
      min-width:70px;min-height:46px;padding:3px 8px 4px;border-radius:9px;border:1px solid rgba(201,162,84,.5);border-top:3px solid var(--cap,#c9a254);
      background:linear-gradient(180deg,var(--wood1),var(--wood2));color:#f3e9d2;font-family:Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:.01em;
      box-shadow:inset 0 1px 0 rgba(255,236,190,.14),0 2px 5px rgba(0,0,0,.45);transition:transform .08s ease,box-shadow .12s ease,background .12s ease}
    .actions.menu-v1 button::before{display:block;font-size:.95rem;line-height:1;font-family:system-ui,'Apple Color Emoji','Segoe UI Emoji',sans-serif;margin-bottom:1px}
    .actions.menu-v1 button small{font-family:system-ui,sans-serif;font-weight:600;font-size:.58rem;line-height:1.1;opacity:.85;color:#e7d6ac}
    .actions.menu-v1 button:hover{background:linear-gradient(180deg,#4a3f31,#2c251c);box-shadow:inset 0 1px 0 rgba(255,236,190,.2),0 3px 8px rgba(0,0,0,.5)}
    .actions.menu-v1 button:active{transform:translateY(1px) scale(.98)}
    .actions.menu-v1 button.active,.actions.menu-v1 button[aria-pressed="true"]{background:linear-gradient(180deg,#6b5528,#3e3118);border-color:var(--brass);
      box-shadow:0 0 0 2px rgba(244,216,109,.55),inset 0 1px 0 rgba(255,240,200,.3);outline:none}
    .actions.menu-v1 button:disabled{opacity:.5;filter:grayscale(.8);border-style:dashed;border-top-style:solid;box-shadow:none;cursor:not-allowed}
    .actions.menu-v1 button[data-menu-group="bevel"]{--cap:#b5432f}
    .actions.menu-v1 button[data-menu-group="formatie"]{--cap:#3d63a8}
    .actions.menu-v1 button[data-menu-group="regiment"]{--cap:#c9a254}
    .actions.menu-v1 button[data-menu-group="productie"]{--cap:#3f8f7d}
    .actions.menu-v1 button[data-menu-group="werk"]{--cap:#7aa34a}
    .actions.menu-v1 button[data-menu-group="bouwen"]{--cap:#9a6b3a}
    .actions.menu-v1 .menu-label{font-family:Georgia,'Times New Roman',serif;font-size:.66rem;color:#e9c76a;text-shadow:0 1px 0 rgba(0,0,0,.6)}
    .actions.menu-v1 button[data-action="skirmish"]::before{content:"🌿"}
    .actions.menu-v1 button[data-action="train-grenadier"]::before{content:"🎩"}
    .actions.menu-v1 button[data-action="train-voltigeur"]::before{content:"🪶"}
    .actions.menu-v1 button[data-action="train-cuirassier"]::before{content:"🛡"}
    .actions.menu-v1 button[data-action="train-hussar"]::before{content:"🐎"}
    .actions.menu-v1 button[data-action="train-guard"]::before{content:"🦅"}
    .actions.menu-v1 button[data-action="train-sapper"]::before{content:"🪓"}
    .actions.menu-v1 button[data-action="train-lancer"]::before{content:"🚩"}
    .actions.menu-v1 button[data-action="train-heavy12"]::before{content:"💥"}
    .actions.menu-v1 button[data-action="train-howitzer"]::before{content:"🎇"}
    .actions.menu-v1 button[data-action="train-horseart"]::before{content:"🏇"}
    .actions.menu-v1 button[data-action="train-mounted"]::before{content:"🎖"}
    .actions.menu-v1 button[data-action="quick-regiment"]::before,.actions.menu-v1 button[data-action="quick-regiment-barracks"]::before{content:"⚑"}
    .actions.menu-v1 button[data-action="train-missing"]::before{content:"➕"}
    .actions.menu-v1 button[data-action="auto-regiment"]::before{content:"🔁"}
    .actions.menu-v1 button[data-action="build-house"]::before{content:"🏠"}
    .actions.menu-v1 button[data-action="build-farm"]::before{content:"🌾"}
    .actions.menu-v1 button[data-action="build-barracks"]::before{content:"🏛"}
    .actions.menu-v1 button[data-action="build-tower"]::before{content:"🗼"}
    .actions.menu-v1 button[data-action="build-hospital"]::before{content:"⛺"}
    .actions.menu-v1 button[data-action="build-stable"]::before{content:"🐎"}
    .actions.menu-v1 button[data-action="build-foundry"]::before{content:"🔥"}
    .actions.menu-v1 button[data-action="build-mine"]::before,.actions.menu-v1 button[data-action="mine-assign"]::before{content:"⛏"}
    .actions.menu-v1 button[data-action="build-lumbercamp"]::before,.actions.menu-v1 button[data-action="lumber-assign"]::before{content:"🪓"}
    .actions.menu-v1 button[data-action="farm-assign"]::before{content:"🧺"}
    .actions.menu-v1 button[data-action="resume-construction"]::before{content:"🔨"}
    .actions.menu-v1 button[data-action="halt"]::before{content:"✋"}
    .actions.menu-v1 button[data-action="bayonet"]::before{content:"🗡"}
    .actions.menu-v1 button[data-action="charge"]::before{content:"🐎"}
    .actions.menu-v1 button[data-action="artillery-mode"]::before{content:"💥"}
    .actions.menu-v1 button[data-action="create-regiment"]::before{content:"🎖"}
    .actions.menu-v1 button[data-action="reinforce-regiment"]::before{content:"➕"}
    .actions.menu-v1 button[data-action="select-nearby-infantry"]::before{content:"👥"}
    .actions.menu-v1 button[data-action="toggle-regiment-tap-selection"]::before{content:"☝"}
    .actions.menu-v1 button[data-action="add-nearest-regiment"]::before{content:"➕"}
    .actions.menu-v1 button[data-action="create-cavalry-regiment"]::before{content:"🐎"}
    .actions.menu-v1 button[data-action="create-battery"]::before{content:"💣"}
    .actions.menu-v1 button[data-action="crew-gun"]::before{content:"💣"}
    .actions.menu-v1 button[data-action="train-worker"]::before{content:"👨‍🌾"}
    .actions.menu-v1 button[data-action="train-infantry"]::before{content:"💂"}
    .actions.menu-v1 button[data-action="train-officer"]::before{content:"🎖"}
    .actions.menu-v1 button[data-action="train-drummer"]::before{content:"🥁"}
    .actions.menu-v1 button[data-action="train-cavalry"]::before{content:"🐎"}
    .actions.menu-v1 button[data-action="train-artillery"]::before{content:"💣"}
    .actions.menu-v1 button[data-formation="line"]::before{content:"▬▬▬";letter-spacing:-2px}
    .actions.menu-v1 button[data-formation="column"]::before{content:"▮";letter-spacing:-2px}
    .actions.menu-v1 button[data-formation="square"]::before{content:"◻";letter-spacing:-2px}
  `;
  document.head.appendChild(style);
  actionsEl.classList.add('menu-v1');
  let busy = false, signature = '';
  const stats = { organized: 0 };
  let previousSelection = '';
  function organize() {
    if (busy) return;
    busy = true;
    try {
      const c = context();
      // Keep the relevant creation button on-screen before the horizontally
      // scrolling formation controls when selecting ungrouped horsemen.
      const groups = c.cavalryDraft ? [GROUPS.find(g=>g.id==='regiment'),...GROUPS.filter(g=>g.id!=='regiment')] : GROUPS;
      const shown = new Set(groups.filter(g => g.show(c)).map(g => g.id));
      const buttons = [...actionsEl.querySelectorAll(':scope > button')];
      const counts = {};
      for (const el of buttons) {
        const g = groupOf(el), visible = shown.has(g);
        el.classList.toggle('menu-hidden', !visible);
        if (el.dataset.menuGroup !== g) el.dataset.menuGroup = g;
        el.style.order = String(groups.findIndex(q => q.id === g) * 100 + rank(el));
        if (visible) counts[g] = (counts[g] || 0) + 1;
      }
      // Group headings, before the first button of each shown group.
      const sig = groups.map(g => g.id + ':' + (counts[g.id] || 0)).join('|') + (c.any ? '' : '|none');
      if (sig !== signature) {
        signature = sig;
        actionsEl.querySelectorAll(':scope > .menu-label, :scope > .menu-hint').forEach(el => el.remove());
        let first = true;
        groups.forEach((g, i) => {
          if (!counts[g.id] || !g.label) return;
          const lab = document.createElement('span');
          lab.className = 'menu-label' + (first ? ' first' : ''); lab.dataset.menuGroup = g.id; lab.textContent = g.label;
          lab.style.order = String(i * 100); first = false;
          actionsEl.appendChild(lab);
        });
        if (!c.any) {
          const hint = document.createElement('span');
          hint.className = 'menu-hint'; hint.textContent = 'Tik boeren aan om te bouwen en te werken, soldaten om bevelen te geven of een regiment te maken, of een gebouw om te trainen.';
          hint.style.order = '-1';
          actionsEl.appendChild(hint);
        }
      }
      if(c.selectionKey!==previousSelection){
        previousSelection=c.selectionKey;
        if(c.cavalryDraft)actionsEl.scrollLeft=0;
      }
      stats.organized++;
    } finally { busy = false; }
  }
  new MutationObserver(() => { if (!busy) organize(); }).observe(actionsEl, { childList: true });
  if (typeof updateHud === 'function') {
    const base = updateHud;
    updateHud = function updateHudWithActionMenu(...args) { const r = base.apply(this, args); organize(); return r; };
  }
  organize();

  // Compact top bar on a phone: sound, wind and weather show as icons only
  // (their words go to the tooltip), so the resources keep their room.
  const narrow = root.matchMedia ? root.matchMedia('(max-width: 860px), (pointer: coarse)') : { matches: false };
  const COMPACT = {
    'topdown-audio-toggle': t => t.split(' ')[0],
    'topdown-wind-direction-v267': t => t.replace(/^Wind\s*/, ''),
    'weather-indicator': t => t.split(' ')[0]
  };
  const topStyle = document.createElement('style');
  topStyle.textContent = `@media (max-width: 860px), (pointer: coarse){
    .topbar #topdown-audio-toggle,.topbar #topdown-wind-direction-v267,.topbar #weather-indicator{min-width:0!important;flex:0 0 auto!important;padding:3px 6px!important;font-size:.95rem!important;line-height:1!important}
    .topbar #topdown-audio-toggle{min-height:38px!important}
    .topbar .resources{flex:1 1 auto!important;min-width:0!important;gap:1px!important}
    .topbar .resources span{padding:4px 2px!important}}
    @media (max-width: 430px){.topbar .resources{font-size:.66rem!important}.topbar #topdown-audio-toggle,.topbar #topdown-wind-direction-v267,.topbar #weather-indicator{padding:3px 4px!important;font-size:.85rem!important}}`;
  document.head.appendChild(topStyle);
  function compactTop() {
    if (!narrow.matches) return;
    for (const [id, short] of Object.entries(COMPACT)) {
      const el = document.getElementById(id); if (!el) continue;
      const text = el.textContent || '';
      if (el.dataset.short === text) continue;
      el.title = text; el.setAttribute('aria-label', text);
      const c = short(text); el.dataset.short = c; el.textContent = c;
    }
  }
  for (const id of Object.keys(COMPACT)) {
    const el = document.getElementById(id);
    if (el) new MutationObserver(compactTop).observe(el, { childList: true, characterData: true, subtree: true });
  }
  setTimeout(compactTop, 0); addEventListener('load', () => setTimeout(() => {
    compactTop();
    for (const id of Object.keys(COMPACT)) { const el = document.getElementById(id); if (el && !el.dataset.watched) { el.dataset.watched = '1'; new MutationObserver(compactTop).observe(el, { childList: true, characterData: true, subtree: true }); } }
  }, 50));

  root.__ACTION_MENU_V1__ = Object.freeze({
    version: '1.0', organize, groups: GROUPS.map(g => g.id), groupOf,
    visible: () => [...actionsEl.querySelectorAll(':scope > button')].filter(b => !b.classList.contains('menu-hidden')).map(b => b.dataset.action || 'formation:' + b.dataset.formation),
    labels: () => [...actionsEl.querySelectorAll(':scope > .menu-label')].sort((a, b) => a.style.order - b.style.order).map(l => l.dataset.menuGroup),
    stats: () => ({ ...stats })
  });
})(window);
