'use strict';
// ---------- v0.6.2 manual test lab ----------

const testLabState = { visible:false, refreshClock:0, lastScenario:'normaal' };

function clearScenarioUnitsV062() {
  for (const u of units) u.dead = true;
  for (const r of regiments) r.destroyed = true;
  selectedUnits.clear(); selectedBuilding = null; actionSignature = '';
}
function makeInfantryRegimentScenarioV062(side, x, y, count = 18) {
  const made=[];
  for(let i=0;i<count;i++) made.push(createUnit(side,'infantry',x+(i%9)*18,y+Math.floor(i/9)*20));
  made.push(createUnit(side,'officer',x+60,y-34));
  made.push(createUnit(side,'drummer',x+90,y-34));
  return createRegiment(side,made);
}
function makeCavalryRegimentScenarioV062(side,x,y,count=8){
  const made=[];for(let i=0;i<count;i++)made.push(createUnit(side,'cavalry',x+(i%4)*30,y+Math.floor(i/4)*32));
  made.push(createUnit(side,'officer',x+45,y-38));
  return createCavalryRegimentV06(side,made);
}
function makeBatteryScenarioV062(side,x,y){
  const gun=createUnit(side,'artillery',x,y),c1=createUnit(side,'infantry',x-30,y-15),c2=createUnit(side,'infantry',x-30,y+15);
  return createArtilleryBatteryV06(side,gun,[c1,c2]);
}
function scenarioBaseV062(){
  resetGame();
  v05PeaceMode = true;
  gameOver = false;
  messageEl.classList.add('hidden');
  camera.x=WORLD.width/2; camera.y=WORLD.height/2; camera.zoom=.72;
}
function runScenarioV062(name){
  testLabState.lastScenario=name;
  scenarioBaseV062();
  if(name==='normaal'){v05PeaceMode=false;statusEl.textContent='Normale slag geladen.';return true;}
  clearScenarioUnitsV062();
  const midX=WORLD.width/2, midY=WORLD.height/2;
  if(name==='regiment-duel'){
    const fr=makeInfantryRegimentScenarioV062('france',midX-520,midY,24),br=makeInfantryRegimentScenarioV062('britain',midX+520,midY,24);
    if(fr) orderGroupPathV06(fr,midX-120,midY,'line',0); if(br) orderGroupPathV06(br,midX+120,midY,'line',Math.PI);
    statusEl.textContent='TEST: infanterieregiment versus regiment.';
  } else if(name==='cavalry-charge'){
    const fr=makeCavalryRegimentScenarioV062('france',midX-500,midY,10); makeInfantryRegimentScenarioV062('britain',midX+260,midY,24);
    if(fr){regimentMembers(fr).forEach(u=>u.chargeTimer=12);orderGroupPathV06(fr,midX+180,midY,'line',0);} statusEl.textContent='TEST: cavaleriecharge tegen infanterie.';
  } else if(name==='artillery-3'){
    for(let i=0;i<3;i++)makeBatteryScenarioV062('france',midX-420,midY-120+i*120);
    for(let i=0;i<36;i++)createUnit('britain','infantry',midX+260+(i%12)*18,midY-140+Math.floor(i/12)*22);
    statusEl.textContent='TEST: drie bemande kanonnen.';
  } else if(name==='morale-35'){
    const reg=makeInfantryRegimentScenarioV062('france',midX-120,midY,24); if(reg){regimentMembers(reg).forEach(u=>u.morale=35);refreshRegiment(reg);selectWholeRegiment(reg);} statusEl.textContent='TEST: regiment op ongeveer 35% moraal.';
  } else if(name==='strength-40'){
    const reg=makeInfantryRegimentScenarioV062('france',midX-120,midY,18); if(reg){const combat=regimentMembers(reg).filter(u=>u.type==='infantry');const keep=Math.max(1,Math.ceil(reg.initialStrength*.40));combat.slice(keep).forEach(u=>u.dead=true);refreshRegiment(reg);if(!reg.destroyed)selectWholeRegiment(reg);} statusEl.textContent='TEST: regiment rond 40% resterende sterkte.';
  } else if(name==='performance-520'){
    for(let i=0;i<260;i++){createUnit('france','infantry',550+(i%26)*18,500+Math.floor(i/26)*19);createUnit('britain','infantry',WORLD.width-1020+(i%26)*18,500+Math.floor(i/26)*19);} statusEl.textContent='PERFORMANCE TEST: 520 musketiers.';
  } else if(name==='british-developed'){
    // Keep the normal economy, freeze combat and fast-forward development.
    resetGame(); v05PeaceMode=true; economies.britain.food+=9000; economies.britain.wood+=9000; window.RTS_SIM.step(300); statusEl.textContent='TEST: Britse ontwikkeling 5 minuten vooruitgesimuleerd.';
  } else return false;
  recalcPopCap('france');recalcPopCap('britain');rebuildSpatialHash();updateHud(true);return true;
}

function selectedDebugSummaryV062(){
  const regs=selectedRegiments();
  if(regs.length===1){const r=regs[0];return{type:'group',id:r.id,kind:groupKindV06(r),name:r.name,morale:+(r.morale||0).toFixed(1),formation:r.formation,facingDegrees:Math.round(((r.facing||0)*180/Math.PI+360)%360),living:regimentMembers(r).length,pathIndex:r.pathIndex||0,pathLength:r.path?.length||0};}
  if(selectedBuilding)return{type:'building',id:selectedBuilding.id,kind:selectedBuilding.type,queue:selectedBuilding.queue.map(q=>q.type),production:+selectedBuilding.production.toFixed(3)};
  return{type:'units',count:[...selectedUnits].filter(u=>!u.dead).length,ids:[...selectedUnits].filter(u=>!u.dead).map(u=>u.id)};
}
function createBugReportV062(){
  const snap=window.RTS_SIM.snapshot();
  return JSON.stringify({
    report:'Napoleonic RTS bug report',createdAt:new Date().toISOString(),version:window.RTS_SIM.version,scenario:testLabState.lastScenario,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio||1},selection:selectedDebugSummaryV062(),metrics:window.RTS_SIM.getMetrics(),audit:window.RTS_SIM.audit(),state:{elapsed:snap.elapsed,economies:snap.economies,ai:snap.ai,selection:snap.selection,units:snap.units,buildings:snap.buildings,groups:snap.groups}
  },null,2);
}
async function copyBugReportV062(){
  const text=createBugReportV062();
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);statusEl.textContent='Debugrapport gekopieerd naar klembord.';return true;}}catch(_){/* fallback below */}
  const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(_){ok=false;}ta.remove();statusEl.textContent=ok?'Debugrapport gekopieerd.':'Kopiëren geblokkeerd; rapport staat in debugpaneel.';if(!ok)console.log(text);return ok;
}

const debugPanelV062=document.createElement('aside');
debugPanelV062.id='debugPanel';debugPanelV062.className='debug-panel hidden';
debugPanelV062.innerHTML=`<div class="debug-head"><strong>TESTLAB v0.6.2</strong><button type="button" data-debug-action="close">×</button></div><div id="debugMetrics" class="debug-metrics"></div><div id="debugSelection" class="debug-selection"></div><label>Testscenario<select id="debugScenario"><option value="normaal">Normale slag</option><option value="regiment-duel">Regiment vs regiment</option><option value="cavalry-charge">Cavaleriecharge</option><option value="artillery-3">3 bemande kanonnen</option><option value="morale-35">Regiment 35% moraal</option><option value="strength-40">Regiment 40% sterkte</option><option value="performance-520">520 units performance</option><option value="british-developed">Britse basis +5 min</option></select></label><div class="debug-buttons"><button type="button" data-debug-action="run">Laad scenario</button><button type="button" data-debug-action="audit">Controleer state</button><button type="button" data-debug-action="copy">Kopieer bugrapport</button></div><pre id="debugAudit">F3 sluit/open dit venster.</pre>`;
document.body.appendChild(debugPanelV062);
const debugMetricsV062=debugPanelV062.querySelector('#debugMetrics'),debugSelectionV062=debugPanelV062.querySelector('#debugSelection'),debugAuditV062=debugPanelV062.querySelector('#debugAudit'),debugScenarioV062=debugPanelV062.querySelector('#debugScenario');

function setDebugVisibleV062(visible){testLabState.visible=!!visible;debugPanelV062.classList.toggle('hidden',!testLabState.visible);if(testLabState.visible)renderDebugPanelV062();}
function renderDebugPanelV062(){
  if(!testLabState.visible)return;const m=window.RTS_SIM.getMetrics(),audit=window.RTS_SIM.audit();
  debugMetricsV062.innerHTML=`<span>FPS <b>${m.fps.toFixed(0)}</b></span><span>frame <b>${m.frameMs.toFixed(1)} ms</b></span><span>update <b>${m.updateMs.toFixed(2)} ms</b></span><span>draw <b>${m.drawMs.toFixed(2)} ms</b></span><span>units <b>${m.livingUnits}</b></span><span>groepen <b>${m.activeGroups}</b></span><span>nav correcties <b>${navStats.overlapCorrections}</b></span><span>combat candidates/query <b>${m.avgCombatCandidates.toFixed(1)}</b></span><span>stalled <b>${m.stalledGroups}</b></span><span>AI <b>${aiPlan}</b></span>`;
  const s=selectedDebugSummaryV062();debugSelectionV062.textContent=s.type==='group'?`${s.name} · ${s.kind} · moraal ${s.morale}% · ${s.formation} · ${s.facingDegrees}° · ${s.living} levend · pad ${s.pathIndex}/${s.pathLength}`:s.type==='building'?`${s.kind} #${s.id} · queue ${s.queue.join(', ')||'leeg'} · ${Math.round(s.production*100)}%`:`${s.count} losse unit(s) geselecteerd`;
  debugAuditV062.textContent=audit.ok?(audit.warnings.length?`STATE OK\nWaarschuwing: ${audit.warnings.join('\n')}`:'STATE OK'):`FOUTEN (${audit.errors.length})\n${audit.errors.slice(0,8).join('\n')}`;
}

debugPanelV062.addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn)return;const action=btn.dataset.debugAction;if(action==='close')setDebugVisibleV062(false);else if(action==='run'){runScenarioV062(debugScenarioV062.value);renderDebugPanelV062();}else if(action==='audit')renderDebugPanelV062();else if(action==='copy')await copyBugReportV062();});
addEventListener('keydown',e=>{if(e.key==='F3'){e.preventDefault();setDebugVisibleV062(!testLabState.visible);}});

const updateV062ForTestLab=update;
update=function updateTestLabV062(dt){updateV062ForTestLab(dt);testLabState.refreshClock+=dt;if(testLabState.visible&&testLabState.refreshClock>=.3){testLabState.refreshClock=0;renderDebugPanelV062();}};

if(window.__RTS_DEBUG__){
  window.__RTS_DEBUG__.setDebugVisible=setDebugVisibleV062;
  window.__RTS_DEBUG__.runScenario=runScenarioV062;
  window.__RTS_DEBUG__.createBugReport=createBugReportV062;
  window.__RTS_DEBUG__.audit=()=>window.RTS_SIM.audit();
  window.__RTS_DEBUG__.getPerformance=()=>window.RTS_SIM.getMetrics();
  window.__RTS_DEBUG__.simulationSnapshot=()=>window.RTS_SIM.snapshot();
}
