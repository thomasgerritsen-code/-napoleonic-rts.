'use strict';
(function installOnlineClient(root){
  if(document.readyState!=='complete'){addEventListener('load',()=>installOnlineClient(root),{once:true});return;}
  // Only the multiplayer entry and invitation links install online controls.
  // Singleplayer keeps its local inputs and AI without a lobby or session.
  if(root.__NRTS_SERVER__||root.__ONLINE_MATCH_V1__||!root.__NRTS_LOBBY_ONLY__)return;
  const params=new URLSearchParams(location.search), protocol=root.NRTS_COMMAND_PROTOCOL;
  const storage={get:(kind,key)=>{try{return root[kind].getItem(key);}catch(_){return null;}},set:(kind,key,value)=>{try{root[kind].setItem(key,value);}catch(_){}}};
  const endpointDefault=params.get('server')||root.NRTS_MULTIPLAYER_URL||storage.get('localStorage','nrts-server')||(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)||location.port?`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/multiplayer`:'');
  const style=document.createElement('style');style.textContent=`
    .online-match .objective{display:none!important}#multiplayerButton{min-height:40px}#onlineLobby{color:#eee6d4;background:#19231d;border:1px solid #b6a071;border-radius:12px;padding:20px;width:min(420px,calc(100vw - 32px));max-height:88dvh;overflow:auto;box-sizing:border-box;font:15px/1.45 system-ui}
    #onlineLobby::backdrop{background:rgba(0,0,0,.72)}#onlineLobby h2{margin:0 0 12px}#onlineLobby label{display:block;margin:12px 0 5px}#onlineLobby input{box-sizing:border-box;width:100%;padding:10px;background:#0e1712;color:#fff;border:1px solid #64705c;border-radius:5px;font:inherit}
    #onlineLobby button{min-height:44px;padding:8px 12px;margin:6px 4px 0 0;font:inherit}#onlineLobby [hidden]{display:none!important}#onlineLobby .online-note{color:#c2c8bb;font-size:13px}#onlineStatus{min-height:44px}#onlineInvite{overflow-wrap:anywhere}#onlineClose{float:right;margin-top:0!important}
    @media(pointer:coarse),(max-width:860px){#multiplayerButton{position:fixed;right:10px;top:108px;z-index:41;min-width:76px;background:#19231d}#onlineLobby{padding:16px}}
  `;document.head.appendChild(style);
  const button=document.createElement('button');button.id='multiplayerButton';button.type='button';button.textContent='Online';button.setAttribute('aria-haspopup','dialog');
  document.querySelector('.topbar').appendChild(button);
  const dialog=document.createElement('dialog');dialog.id='onlineLobby';dialog.setAttribute('aria-labelledby','onlineTitle');
  dialog.innerHTML='<button id="onlineClose" type="button" aria-label="Sluiten">Sluiten</button><h2 id="onlineTitle">Online veldslag</h2><p>Speel met twee personen: Frankrijk tegen Groot-Brittannië.</p><label for="onlineServer">Spelserver</label><input id="onlineServer" type="url" placeholder="wss://jouw-spelserver/multiplayer" autocomplete="url"><p class="online-note">Open de uitnodiging op een ander toestel om mee te spelen.</p><button id="onlineHost" type="button">Spel hosten · 🇫🇷</button><label for="onlineRoom">Kamercode</label><input id="onlineRoom" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false"><button id="onlineJoin" type="button">Meedoen · 🇬🇧</button><p id="onlineStatus" role="status" aria-live="polite">Maak een kamer of voer een kamercode in.</p><div id="onlineShare" hidden><label for="onlineInvite">Uitnodigingslink</label><input id="onlineInvite" readonly><button id="onlineCopy" type="button">Kopieer uitnodiging</button><p id="onlinePlayers"></p></div><button id="onlineLeave" type="button" hidden>Online spel verlaten</button><p class="online-note" id="onlineHostingNote">Nog geen serveradres? De online spelserver moet eerst op hosting draaien. Je kunt intussen gewoon alleen spelen.</p>';
  document.body.appendChild(dialog);
  const el=id=>document.getElementById(id),status=text=>{el('onlineStatus').textContent=text;};
  el('onlineServer').value=endpointDefault;el('onlineRoom').value=params.get('room')||'';
  button.onclick=()=>dialog.showModal();
  const lobbyEntry=params.get('mode')==='multiplayer';
  el('onlineClose').onclick=()=>{if(lobbyEntry&&!online.active)location.assign(new URL('./',location.href).href);else dialog.close();};
  dialog.addEventListener('cancel',e=>{if(lobbyEntry&&!online.active){e.preventDefault();location.assign(new URL('./',location.href).href);}});
  let socket=null,retry=null,readyTimer=null,generation=0,seq=0,retryDelay=500,ended=false,baseline=null,credentials=null,endpoint='',room='',side=null,lastTick=-1;
  const online={active:false,phase:'offline',view:null,lastReceivedAt:0,side:null,frame:(now,dt)=>root.__ONLINE_VIEW_V1__.frame(now,dt),send,
    stats:()=>({phase:online.phase,side,room,tick:lastTick,seq,connected:socket?.readyState===WebSocket.OPEN})};
  root.__ONLINE_MATCH_V1__=online;
  for(const name of ['aiDevelop','aiMilitaryOrder','aiBuild','aiQueue']){const base=root[name];if(typeof base==='function')root[name]=function(...args){return online.active?false:base.apply(this,args);};}
  const reasons={
    'server-full':'De server is vol. Probeer het later opnieuw.','room-full':'Deze kamer heeft al twee spelers.','room-not-found':'Deze kamer bestaat niet meer.',
    'invalid-session':'De sessie is verlopen. Maak een nieuwe kamer.','version-mismatch':'De spelversies verschillen. Vernieuw beide spellen.',
    'match-paused':'De strijd wacht tot beide spelers verbonden zijn.','rate-limit':'Te veel opdrachten tegelijk. Probeer het zo opnieuw.',
    'game-rule-rejected':'Deze opdracht kan nu niet worden uitgevoerd.','unit-not-owned':'Je kunt alleen je eigen soldaten bevelen.',
    'player-left':'Een speler heeft de veldslag verlaten.','expired':'De kamer is verlopen.','server-stopped':'De spelserver wordt opnieuw gestart.',
    'server-error':'De spelserver kon de veldslag niet verwerken.'
  };
  function message(reason){status(reasons[reason]||'De opdracht is geweigerd. Probeer het opnieuw.');}
  function sessionKey(){return `nrts-session:${endpoint}:${room}`;}
  function controls(){el('onlineHost').disabled=online.active;el('onlineJoin').disabled=online.active;el('onlineServer').disabled=online.active;el('onlineRoom').disabled=online.active;el('onlineLeave').hidden=!online.active;el('onlineHostingNote').hidden=!!endpoint;document.body.classList.toggle('online-match',online.active);}
  function resolveEndpoint(value){const u=new URL(value);if(!['ws:','wss:'].includes(u.protocol)||u.username||u.password||u.hash||u.search)throw Error('Gebruik een geldig ws:// of wss:// serveradres.');if(location.protocol==='https:'&&u.protocol!=='wss:')throw Error('Gebruik voor online spelen een beveiligd wss:// serveradres.');if(u.pathname==='/')u.pathname='/multiplayer';return u.href;}
  function send(raw){
    if(!online.active||online.phase!=='playing'||socket?.readyState!==WebSocket.OPEN){status('Wacht tot beide spelers verbonden en klaar zijn.');return false;}
    const result=protocol.normalize({...raw,v:1,seq:++seq});if(!result.ok){message(result.reason);return false;}
    socket.send(JSON.stringify({type:'command',command:result.command}));return true;
  }
  function selection(type,data,building=selectedBuilding){return {v:1,seq:seq+1,type,unitIds:[...selectedUnits].filter(u=>!u.dead).map(u=>u.id),buildingId:building?.id??null,data};}
  const baseGather=assignGather;
  assignGather=function(r){return online.active?(r?send(selection('gather',{resourceId:r.id})):false):baseGather(r);};
  const baseRally=finishRallyPlacementV06;
  finishRallyPlacementV06=function(x,y,b=rallyPlacementBuilding){if(!online.active)return baseRally(x,y,b);const ok=send(selection('rally',{x,y},b));if(ok){rallyPlacementBuilding=null;buildHintEl.classList.add('hidden');}return ok;};
  const remoteActions=new Set(['quick-regiment','quick-regiment-barracks','train-missing','auto-regiment','defend-stance','reinforce-regiment','trench-upgrade','tower-upgrade','crew-gun','farm-assign','resume-construction','skirmish']);
  actionsEl.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!online.active||!b||b.disabled||!remoteActions.has(b.dataset.action))return;e.preventDefault();e.stopImmediatePropagation();send(selection('action',{action:b.dataset.action}));},true);
  // Keyboard shortcuts belonging to closure-based tactical modules must also
  // use the command path rather than mutate the local read-only view.
  addEventListener('keydown',e=>{if(!online.active||e.target.closest?.('input,textarea,select,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='v'){e.preventDefault();e.stopImmediatePropagation();send(selection('action',{action:'defend-stance'}));}},true);
  el('resetBtn').addEventListener('click',e=>{if(!online.active)return;e.preventDefault();e.stopImmediatePropagation();dialog.showModal();status('Verlaat eerst de online veldslag om een nieuwe slag te starten.');},true);
  function apply(message){
    if(message.type==='snapshot')baseline=message.view;
    else {
      if(!baseline){socket.close(4000,'Missing baseline');return;}
      const state={...message.view.state};
      for(const key of ['units','buildings','groups','resources']){const rows=new Map(baseline.state[key].map(e=>[e.id,e]));for(const id of state[key].remove)rows.delete(id);for(const e of state[key].put)rows.set(e.id,e);state[key]=[...rows.values()];}
      baseline={...message.view,state};
    }
    if(baseline.tick<lastTick)return;lastTick=baseline.tick;
    online.view=baseline;root.__ONLINE_VIEW_V1__.receive(baseline);online.lastReceivedAt=performance.now();
    for(const ack of baseline.acknowledgements)if(!ack.ok)messageErrorOnce(ack);
  }
  let lastErrorSeq=0;
  function messageErrorOnce(ack){if(ack.seq<=lastErrorSeq)return;lastErrorSeq=ack.seq;message(ack.reason);}
  function connect(mode){
    const mine=++generation;clearTimeout(retry);clearTimeout(readyTimer);baseline=null;
    const ws=new WebSocket(endpoint);socket=ws;
    ws.onopen=()=>{if(mine!==generation)return;status('Verbonden. Kamer wordt voorbereid…');ws.send(JSON.stringify({type:mode,protocol:1,...(room?{room}:{}),...(mode==='resume'?{token:credentials.token}:{})}));};
    ws.onmessage=e=>{
      if(mine!==generation)return;
      let msg;try{msg=JSON.parse(e.data);}catch(_){ws.close();return;}
      if(msg.type==='welcome'){
        retryDelay=500;room=msg.room;side=msg.side;seq=msg.seq;online.side=side;credentials={token:msg.token};
        storage.set('sessionStorage',sessionKey(),JSON.stringify(credentials));
        el('onlineRoom').value=room;el('onlineShare').hidden=false;
        const invite=new URL(location.href);invite.hash='';invite.search='';invite.searchParams.set('view','iso');invite.searchParams.set('mode','multiplayer');invite.searchParams.set('v','147');invite.searchParams.set('server',endpoint);invite.searchParams.set('room',room);el('onlineInvite').value=invite.href;
        const current=new URL(location.href);current.searchParams.set('server',endpoint);current.searchParams.set('room',room);history.replaceState(null,'',current.href);
        const flag=document.querySelector('.resources > span');if(flag)flag.firstChild.textContent=side==='france'?'🇫🇷 🍞 ':'🇬🇧 🍞 ';
        const ready=()=>{if(mine!==generation||ws.readyState!==WebSocket.OPEN)return;if(root.__ISO_ASSETS_READY__===false||!baseline){status(root.__ISO_ASSETS_READY__===false?'Kaart en afbeeldingen laden…':'Spelstatus ophalen…');readyTimer=setTimeout(ready,100);return;}ws.send(JSON.stringify({type:'ready'}));};ready();return;
      }
      if(msg.type==='room'){
        online.phase=msg.phase;button.textContent=(side==='britain'?'🇬🇧':'🇫🇷')+' Online';button.title=`Kamer ${room}`;
        el('onlinePlayers').textContent=msg.players.map(p=>`${p.side==='france'?'🇫🇷 Frankrijk':'🇬🇧 Groot-Brittannië'}: ${p.connected?(p.ready?'klaar':'laden…'):'wacht op verbinding'}`).join(' · ');
        status(msg.phase==='playing'?'De strijd is begonnen. Sluit dit venster om te spelen.':msg.phase==='finished'?'De veldslag is afgelopen.':msg.phase==='paused'?'Strijd gepauzeerd. Wachten op de andere speler…':`Kamer ${room} · deel de uitnodiging met de andere speler.`);return;
      }
      if(msg.type==='snapshot'||msg.type==='delta'){apply(msg);return;}
      if(msg.type==='receipt'){if(!msg.ok)message(msg.reason);return;}
      if(msg.type==='ended'){ended=true;online.phase='ended';message(msg.reason);button.textContent='Spel afgelopen';if(!dialog.open)dialog.showModal();return;}
      if(msg.type==='error'){message(msg.reason);if(!credentials||['invalid-session','room-not-found','version-mismatch'].includes(msg.reason)){ended=true;if(!credentials)online.active=false;else online.phase='ended';ws.close();controls();}}
    };
    ws.onerror=()=>{status('Verbinding met de spelserver is niet gelukt. Controleer het serveradres.');};
    ws.onclose=()=>{
      if(mine!==generation||ended)return;
      online.phase='reconnecting';
      if(!credentials){online.active=false;controls();status('Geen verbinding. Controleer het serveradres en probeer opnieuw.');return;}
      status('Verbinding verbroken. De strijd pauzeert; opnieuw verbinden…');button.textContent='Verbinden…';
      retry=setTimeout(()=>connect('resume'),retryDelay);retryDelay=Math.min(10000,retryDelay*2);
    };
  }
  function begin(mode){
    try{endpoint=resolveEndpoint(el('onlineServer').value.trim());}catch(e){status(e.message);return;}
    room=mode==='join'?el('onlineRoom').value.trim().toUpperCase():'';
    if(mode==='join'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(room)){status('Voer de kamercode van acht tekens in.');return;}
    credentials=null;try{const stored=storage.get('sessionStorage',sessionKey());if(stored)credentials=JSON.parse(stored);}catch(_){}
    storage.set('localStorage','nrts-server',endpoint);online.active=true;online.phase='connecting';ended=false;lastTick=-1;lastErrorSeq=0;controls();status('Verbinding met de spelserver maken…');connect(credentials?'resume':mode);
  }
  el('onlineHost').onclick=()=>begin('create');el('onlineJoin').onclick=()=>begin('join');
  el('onlineCopy').onclick=async()=>{try{await navigator.clipboard.writeText(el('onlineInvite').value);status('Uitnodiging gekopieerd. Deel hem met de andere speler.');}catch(_){el('onlineInvite').focus();el('onlineInvite').select();status('Selecteer en kopieer de uitnodigingslink.');}};
  function leave(){ended=true;generation++;clearTimeout(retry);clearTimeout(readyTimer);if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));socket?.close();location.assign(new URL('./',location.href).href);}
  el('onlineLeave').onclick=leave;
  el('mainMenuButton')?.addEventListener('click',e=>{if(online.active){e.preventDefault();leave();}});
  if(params.has('room')&&params.get('mode')!=='singleplayer'){dialog.showModal();begin('join');}
  else if(lobbyEntry)dialog.showModal();
})(window);
