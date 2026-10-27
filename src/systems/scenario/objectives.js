'use strict';
(function installTerritories(root) {
  const cfg = root.NRTS_CONFIG?.territories;
  if (!cfg || root.__TERRITORIES__) return;
  if (document.readyState !== 'complete') { addEventListener('load', () => installTerritories(root), {once:true}); return; }
  let model, latest, remote = null, clock = 0, renderUI = () => {};
  function sites() {
    const a = buildings.find(b=>b.type==='towncenter'&&b.side==='france'), b = buildings.find(b=>b.type==='towncenter'&&b.side==='britain');
    return root.NRTS_TERRITORY_PLACEMENT.place({...cfg,homes:[a,b],world:WORLD,
      isOpen:p=>!crossingAtV067(p.x,p.y)&&[[0,0],[55,0],[-55,0],[0,55],[0,-55]].every(([dx,dy])=>
        root.__UNIT_PLACEMENT__.clear({x:p.x+dx,y:p.y+dy},'cavalry')),
      roadDistance:p=>{
        let nearest=Infinity;
        for(const road of root.NRTS_ROAD_NETWORK_V7||ROAD_NETWORK_V066)
          for(let i=1;i<road.points.length;i++)nearest=Math.min(nearest,closestPointOnSegmentV066(p.x,p.y,road.points[i-1],road.points[i]).distance);
        return Number.isFinite(nearest)?nearest:0;
      }
    });
  }
  function reset() { model=root.NRTS_TERRITORY_STATE.create(sites(),cfg); latest=model.state(); remote=null;clock=0;renderUI(); }
  const state=()=>root.__ONLINE_MATCH_V1__?.active?(remote||latest):latest;
  const api=Object.freeze({state,receive(value){if(value?.points){remote=value;renderUI();}}});
  root.__TERRITORIES__=api;
  const oldReset=resetGame;
  resetGame=function resetGameWithTerritories(...args){const result=oldReset.apply(this,args);reset();return result;};
  const oldUpdate=update;
  update=function updateWithTerritories(dt){
    const result=oldUpdate(dt);
    if(gameOver||root.__ONLINE_MATCH_V1__?.active)return result;
    clock+=dt;
    if(clock+1e-9>=cfg.updateSeconds){
      const steps=Math.floor((clock+1e-9)/cfg.updateSeconds),seconds=steps*cfg.updateSeconds;clock=Math.max(0,clock-seconds);
      model.step(seconds,units,(side,resource,amount)=>{economies[side][resource]+=amount;});latest=model.state();root.__BATTLE__?.territoryStep(seconds,latest);renderUI();
    }
    return result;
  };
  reset();
  // The singleplayer commander also fights over supplies. Local threats still
  // take priority; the existing commander continues to issue and route orders.
  const oldTarget=aiStrategicTarget;
  aiStrategicTarget=function aiStrategicSupplyTarget(){
    const target=oldTarget();
    const home=buildings.find(b=>b.type==='towncenter'&&b.side==='britain');
    if(root.__NRTS_HUMAN_BRITAIN__||!home||home.dead||(target.kind==='regiment'&&Math.hypot(target.x-home.x,target.y-home.y)<900))return target;
    const choices=latest.points.filter(p=>p.owner!=='britain').sort((a,b)=>Math.hypot(a.x-home.x,a.y-home.y)-Math.hypot(b.x-home.x,b.y-home.y));
    return choices.length?{x:choices[0].x,y:choices[0].y,kind:'control-point',id:choices[0].id}:target;
  };
  root.NRTS.subsystems.register('territories',api,{phase:'scenario',legacyBridge:false,responsibility:'public supply objectives with authoritative capture, contesting and resource income'});
  if(root.__NRTS_SERVER__)return;

  const style=document.createElement('style');style.textContent=`
    #territoriesButton{min-height:40px;background:#253027;color:#f3dfaa;border:1px solid #95845e;border-radius:6px;padding:6px 10px}
    #territoriesPanel{box-sizing:border-box;color:#eee6d4;background:#19231d;border:1px solid #b6a071;border-radius:12px;padding:20px;width:min(440px,calc(100vw - 24px));max-height:88dvh;overflow:auto;font:15px/1.45 system-ui}
    #territoriesPanel::backdrop{background:rgba(0,0,0,.7)}#territoriesPanel h2{margin:0 0 10px}#territoriesPanel p{margin:5px 0}#territoriesPanel article{border-top:1px solid #52604d;padding:12px 0}
    #territoriesPanel button{min-height:44px;font:inherit;padding:7px 12px}#territoriesClose{float:right}#territoriesPanel .territory-status{color:#f2d98f}
    @media(pointer:coarse),(max-width:860px){#territoriesButton{position:fixed;right:10px;top:${root.__NRTS_LOBBY_ONLY__?158:108}px;z-index:41;min-width:76px;min-height:40px;font-size:12px}}
  `;document.head.appendChild(style);
  const button=document.createElement('button');button.type='button';button.id='territoriesButton';button.setAttribute('aria-haspopup','dialog');
  document.querySelector('.topbar').appendChild(button);
  const dialog=document.createElement('dialog');dialog.id='territoriesPanel';dialog.setAttribute('aria-labelledby','territoriesTitle');
  dialog.innerHTML='<button type="button" id="territoriesClose">Sluiten</button><h2 id="territoriesTitle">Bevoorradingsposten</h2><p>De drie posten liggen verspreid over het noordelijke, centrale en zuidelijke front. Elke post verzekert de aanvoer van voedsel, hout of ijzer.</p><p>Stuur soldaten naar een vlag en houd het gebied 15 seconden vast. Alleen gevechtseenheden tellen mee.</p><p>Bij vijandelijke aanwezigheid stopt de opbrengst. Zonder soldaten blijft een veroverd gebied van jou.</p>';
  document.body.appendChild(dialog);button.onclick=()=>{renderUI();dialog.showModal();};dialog.querySelector('#territoriesClose').onclick=()=>dialog.close();
  const names={france:'Frankrijk',britain:'Groot-Brittannië'},icons={food:'🍞',wood:'🪵',iron:'⛏️'},cards=new Map();
  for(const p of latest.points){
    const card=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),income=document.createElement('p'),go=document.createElement('button');
    title.textContent=p.label;detail.className='territory-status';income.textContent=`+${p.rate} ${icons[p.resource]} per seconde voor de eigenaar`;
    go.type='button';go.textContent='Bekijk gebied';go.dataset.territory=p.id;
    go.onclick=()=>{const point=state().points.find(q=>q.id===p.id);camera.x=point.x;camera.y=point.y;clampCamera();dialog.close();};
    card.append(title,detail,income,go);dialog.appendChild(card);cards.set(p.id,detail);
  }
  const set=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
  renderUI=()=>{
    const s=state();set(button,`Gebieden · ${s.points.filter(p=>p.owner==='france').length}–${s.points.filter(p=>p.owner==='britain').length}`);
    for(const p of s.points){const owner=names[p.owner]||'Neutraal',detail=p.contested?'Betwist · geen opbrengst':p.claim?`${names[p.claim]} verovert · ${Math.floor(p.progress*100)}%`:(p.owner?'Opbrengst actief':'Nog niet veroverd');set(cards.get(p.id),`${owner} · ${detail}`);}
  };renderUI();root.dispatchEvent(new Event('territories-ui-ready'));
  const oldMini=drawMinimap;
  drawMinimap=function drawMinimapWithTerritories(){oldMini();miniCtx.save();for(const p of state().points){const m=miniPoint(p.x,p.y);miniCtx.fillStyle=p.owner==='france'?'#74a4ef':p.owner==='britain'?'#ef8877':'#efd88e';miniCtx.strokeStyle='#191e18';miniCtx.lineWidth=1;miniCtx.beginPath();miniCtx.moveTo(m.x,m.y-4);miniCtx.lineTo(m.x+4,m.y);miniCtx.lineTo(m.x,m.y+4);miniCtx.lineTo(m.x-4,m.y);miniCtx.closePath();miniCtx.fill();miniCtx.stroke();}miniCtx.restore();};
})(window);

'use strict';
(function installObjectivesScenariosV1(global){
  if(global.NRTS_CONFIG?.territories)return;
  const nrts=global.NRTS;if(!nrts)throw new Error('NRTS required');
  const presets={crossroads:{name:'Kruispunt',points:[{id:'center',x:1600,y:900,label:'Centraal kruispunt'}],target:120},bridge:{name:'Bruggenhoofd',points:[{id:'bridge',x:1600,y:930,label:'Bruggenhoofd'}],target:150},threePoints:{name:'Drie posities',points:[{id:'north',x:1450,y:560,label:'Noord'},{id:'center',x:1600,y:900,label:'Centrum'},{id:'south',x:1550,y:1280,label:'Zuid'}],target:180}};
  const state={scenario:'crossroads',france:0,britain:0,points:[]};
  function resetScenario(name='crossroads'){const p=presets[name]||presets.crossroads;state.scenario=name;state.france=0;state.britain=0;state.points=p.points.map(x=>({...x,owner:null,progress:0}));return snapshot();}
  function troopsNear(side,p){return livingUnits(side).filter(u=>u.type!=='worker'&&!u.routing&&Math.hypot(u.x-p.x,u.y-p.y)<125).length;}
  let clock=0;const oldUpdate=update;update=function(dt){oldUpdate(dt);clock+=dt;if(clock<1)return;clock=0;const preset=presets[state.scenario]||presets.crossroads;for(const p of state.points){const f=troopsNear('france',p),b=troopsNear('britain',p);if(f&& !b){p.progress=Math.min(10,p.progress+1);if(p.progress>=4)p.owner='france';}else if(b&&!f){p.progress=Math.max(-10,p.progress-1);if(p.progress<=-4)p.owner='britain';}else if(f&&b)p.progress*=.8;if(p.owner==='france')state.france++;if(p.owner==='britain')state.britain++;}if(statusEl&&!gameOver)statusEl.textContent=`${preset.name}: 🇫🇷 ${state.france} pt · 🇬🇧 ${state.britain} pt · Win: hoofdgebouw + alle troepen`;};
  const oldReset=resetGame;resetGame=function(){oldReset();resetScenario(state.scenario);};
  function snapshot(){return {scenario:state.scenario,france:state.france,britain:state.britain,points:state.points.map(p=>({...p})),target:(presets[state.scenario]||presets.crossroads).target};}
  const api=Object.freeze({presets:Object.keys(presets),select:resetScenario,state:snapshot});nrts.subsystems.register('objectives-scenarios',api,{phase:'architecture-v2',legacyBridge:false,responsibility:'capture objectives, victory points and skirmish scenario presets'});global.__OBJECTIVES_SCENARIOS_V1__=api;resetScenario();
})(window);
