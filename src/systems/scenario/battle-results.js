'use strict';
(function installBattleResults(root){
  if(!root.NRTS_CONFIG?.territories||root.__BATTLE__)return;
  if(document.readyState!=='complete'){addEventListener('load',()=>installBattleResults(root),{once:true});return;}
  let model,remote=null,shown=null,renderProgress=()=>{},closeResult=()=>{};
  function reset(){model=root.NRTS_BATTLE_STATE.create({holdSeconds:120});model.observe(units,buildings,true);remote=null;shown=null;closeResult();renderProgress();}
  const state=()=>root.__ONLINE_MATCH_V1__?.active?(remote||model.state()):model.state();
  function finish(result){if(!result)return;gameOver=true;showBattleOutcome(result.winner==='draw'?'GELIJKSPEL':result.winner==='france'?'OVERWINNING!':'NEDERLAAG',explanation(result));renderResult(result,'france');}
  checkVictory=function checkBattleVictory(){if(root.__ONLINE_MATCH_V1__?.active)return;if(gameOver)return;finish(model.elimination(units,buildings,elapsed,root.__TERRITORIES__?.state()));};
  const oldUpdate=update;
  update=function updateUntilBattleEnds(dt){if(gameOver)return;return oldUpdate(dt);};
  const oldReset=resetGame;
  resetGame=function resetGameWithBattleResults(...args){const value=oldReset.apply(this,args);reset();return value;};
  root.__BATTLE__=Object.freeze({state,territoryStep(dt,territories){if(gameOver||root.__ONLINE_MATCH_V1__?.active)return;finish(model.territoryStep(dt,territories,elapsed));renderProgress();},receive(value,side){if(!value)return;remote=value;renderProgress();if(value.result)renderResult(value.result,side);}});
  const names={france:'Frankrijk',britain:'Groot-Brittannië'};
  function explanation(result){return result.reason==='territories'?`${names[result.winner]} heeft alle drie gebieden twee minuten onbetwist beheerst.`:result.winner==='draw'?'Beide legers hebben hun hoofdkwartier en alle gevechtstroepen verloren.':`${names[result.winner]} heeft het vijandelijke hoofdkwartier en alle gevechtstroepen uitgeschakeld.`;}
  function renderResult(result,side){
    if(root.__NRTS_SERVER__||shown)return;shown=result;
    messageEl.classList.add('hidden');
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    document.getElementById('battleResultTitle').textContent=result.winner==='draw'?'Gelijkspel':result.winner===side?'Overwinning!':'Nederlaag';
    document.getElementById('battleResultReason').textContent=explanation(result);
    document.getElementById('battleResultDuration').textContent=`Speelduur ${time(result.elapsed)}`;
    for(const faction of ['france','britain'])for(const key of ['trained','unitsLost','unitsRemaining','buildingsLost','buildingsRemaining','territories'])document.getElementById(`battle-${faction}-${key}`).textContent=String(result.stats[faction][key]);
    document.getElementById('battleAgain').hidden=!!root.__ONLINE_MATCH_V1__?.active;
    document.getElementById('battleOnlineNote').hidden=!root.__ONLINE_MATCH_V1__?.active;
    document.getElementById('battleResult').showModal();
  }
  function time(seconds){const n=Math.max(0,Math.floor(seconds));return`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
  reset();
  if(root.__NRTS_SERVER__)return;
  const style=document.createElement('style');style.textContent=`
    #battleResult{box-sizing:border-box;background:#19231d;color:#eee6d4;border:1px solid #b6a071;border-radius:12px;width:min(620px,calc(100vw - 24px));max-height:90dvh;overflow:auto;padding:24px;font:15px/1.5 system-ui}#battleResult::backdrop{background:rgba(0,0,0,.72)}#battleResult h2{margin:0;font-size:clamp(26px,7vw,40px);color:#f2d98f}#battleResult p{margin:8px 0}#battleResult table{width:100%;border-collapse:collapse;font-size:14px;margin:18px 0}#battleResult th,#battleResult td{padding:8px 4px;border-bottom:1px solid #52604d;text-align:right}#battleResult th:first-child{text-align:left;font-weight:500}#battleResult thead th{font-weight:700}#battleResult button{min-height:44px;padding:8px 12px;font:inherit;margin:4px}#battleResult [hidden]{display:none!important}#battleProgress{font-size:13px;color:#f2d98f;margin:12px 0}@media(max-width:440px){#battleResult{padding:16px}#battleResult table{font-size:12px}#battleResult th,#battleResult td{padding:8px 2px}}
  `;document.head.appendChild(style);
  const dialog=document.createElement('dialog');dialog.id='battleResult';dialog.setAttribute('aria-labelledby','battleResultTitle');dialog.setAttribute('aria-describedby','battleResultReason');
  dialog.innerHTML='<h2 id="battleResultTitle"></h2><p id="battleResultReason"></p><p id="battleResultDuration"></p><table><thead><tr><th scope="col">Leger</th><th scope="col">🇫🇷 Frankrijk</th><th scope="col">🇬🇧 Groot-Brittannië</th></tr></thead><tbody></tbody></table><button id="battleAgain" type="button">Nieuwe slag</button><button id="battleMenu" type="button">Hoofdmenu</button><p id="battleOnlineNote">Voor een nieuwe online wedstrijd maak je vanuit het hoofdmenu een nieuwe kamer.</p>';
  const rows={trained:'Getrainde eenheden',unitsLost:'Verloren eenheden',unitsRemaining:'Resterende eenheden',buildingsLost:'Verloren gebouwen',buildingsRemaining:'Resterende gebouwen',territories:'Gebieden in bezit'};
  for(const [key,label]of Object.entries(rows)){const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=label;tr.appendChild(th);for(const side of ['france','britain']){const td=document.createElement('td');td.id=`battle-${side}-${key}`;tr.appendChild(td);}dialog.querySelector('tbody').appendChild(tr);}
  document.body.appendChild(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());
  closeResult=()=>{dialog.close();messageEl.classList.add('hidden');};
  document.getElementById('battleAgain').onclick=()=>{if(!root.__ONLINE_MATCH_V1__?.active)resetGame();};
  document.getElementById('battleMenu').onclick=()=>document.getElementById('mainMenuButton').click();
  const rules=document.createElement('p');rules.id='battleRules';rules.textContent='Win door het vijandelijke hoofdkwartier én alle gevechtstroepen uit te schakelen, of beheers alle drie gebieden 2 minuten. Een vijand bij een vlag zet de aftelling terug op nul.';
  const progress=document.createElement('p');progress.id='battleProgress';progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
  // The territories panel may install after this load listener. Attach once when
  // its DOM exists, using the following module's explicit notification as well.
  renderProgress=()=>{const panel=document.getElementById('territoriesPanel');if(panel&&!rules.isConnected){panel.insertBefore(rules,panel.querySelector('article'));panel.insertBefore(progress,panel.querySelector('article'));}const s=state();const text=s.controlSide?`${names[s.controlSide]} beheerst alles · nog ${time(Math.ceil(s.holdSeconds-s.heldSeconds))} tot gebiedsoverwinning`:'Gebiedsoverwinning: beheers alle 3 gebieden 2 minuten onbetwist.';if(progress.textContent!==text)progress.textContent=text;};
  addEventListener('territories-ui-ready',renderProgress,{once:true});renderProgress();
})(window);
