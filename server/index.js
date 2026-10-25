'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,randomInt}=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {createSimulationHost}=require('./simulation-host.js');
const {createEncoder}=require('./state-delta.js');
const protocol=require('../src/network/command-protocol.js');
const VERSION=require('../package.json').version;
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.ico':'image/x-icon','.woff2':'font/woff2'};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
const token=()=>randomBytes(32).toString('hex');
const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};

async function createServer(options={}){
  const rooms=new Map(),connections=new Set(),limits=new Map();
  const maxRooms=options.maxRooms??Number(process.env.MAX_ROOMS||2);
  if(!Number.isInteger(maxRooms)||maxRooms<1||maxRooms>16)throw Error('MAX_ROOMS must be 1–16');
  const joinTimeoutMs=options.joinTimeoutMs??30000;
  if(!Number.isInteger(joinTimeoutMs)||joinTimeoutMs<1||joinTimeoutMs>60000)throw Error('Invalid connection join timeout');
  const origins=new Set((options.allowedOrigins??process.env.ALLOWED_ORIGINS??'').split(',').filter(Boolean).map(v=>new URL(v.trim()).origin));
  const configuredOrigin=options.publicOrigin??process.env.PUBLIC_ORIGIN??(process.env.RAILWAY_PUBLIC_DOMAIN?`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`:null);
  const publicOrigin=configuredOrigin?new URL(configuredOrigin).origin:null;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/healthz'){const healthy=!!host&&!closing&&(!host.healthy||host.healthy());res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.statusCode=healthy?200:503;res.end(JSON.stringify({ok:healthy,protocol:1,version:VERSION,rooms:rooms.size,capacity:maxRooms}));return;}
    if(pathname==='/src/network/endpoint.js'){
      let endpoint;try{endpoint=new URL('/multiplayer',publicOrigin||`http://${req.headers.host}`);}catch(_){res.writeHead(400).end();return;}endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
      res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(`window.NRTS_MULTIPLAYER_URL=${JSON.stringify(endpoint.href).replace(/</g,'\\u003c')};`);return;
    }
    try{
      const decoded=decodeURIComponent(pathname);
      if(!(decoded==='/'||/^\/(src\/|vendor\/|graphics-lab\/assets\/|assets\/|art\/)/.test(decoded)||/^\/[a-z0-9-]+\.(html|css|ico)$/.test(decoded)))throw Error('Not found');
      const file=await fs.realpath(path.join(ROOT,decoded==='/'?'index.html':decoded.slice(1)));
      if(!file.startsWith(ROOT+path.sep)||!MIME[path.extname(file)])throw Error('Not found');
      const data=await fs.readFile(file);res.setHeader('Content-Type',MIME[path.extname(file)]);res.setHeader('Cache-Control',/\.(html|js|mjs|json)$/.test(file)?'no-cache':'public, max-age=86400');
      res.end(req.method==='HEAD'?undefined:data);
    }catch(_){res.writeHead(404).end('Not found');}
  });
  let closing=false,host;
  const wss=new WebSocketServer({noServer:true,maxPayload:24*1024,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:4}});
  function allow(req){
    const origin=req.headers.origin;
    const sameOrigin=publicOrigin||`http://${req.headers.host}`;
    return !!origin&&(origin===sameOrigin||origins.has(origin));
  }
  server.on('upgrade',(req,socket,head)=>{
    if(closing||new URL(req.url,'http://localhost').pathname!=='/multiplayer'||!allow(req)||connections.size>=maxRooms*4+8){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  const fail=(ws,reason)=>send(ws,{type:'error',reason});
  function roomInfo(room){return {type:'room',room:room.code,phase:room.phase,players:['france','britain'].map(side=>({side,connected:room.players[side]?.ws?.readyState===WebSocket.OPEN,ready:!!room.players[side]?.ready}))};}
  function broadcast(room){const info=roomInfo(room);for(const p of Object.values(room.players))if(p.ws)send(p.ws,info);}
  function phase(room){
    const previous=room.phase;
    room.phase=room.finished?'finished':room.players.france?.ready&&room.players.britain?.ready&&['france','britain'].every(s=>room.players[s]?.ws?.readyState===WebSocket.OPEN)?'playing':room.started?'paused':'waiting';
    // Reconnect time must never be simulated. Between running requests, retain
    // short async delays rather than silently dropping their simulation ticks.
    if(previous!==room.phase)room.lastAdvanceAt=performance.now();
    if(room.phase==='playing')room.started=true;
    broadcast(room);
  }
  async function closeRoom(room,reason){
    if(room.closed)return;room.closed=true;rooms.delete(room.code);
    for(const p of Object.values(room.players))if(p.ws){send(p.ws,{type:'ended',reason});p.ws.close(1000,'Match ended');}
    await room.sim?.close().catch(()=>{});
  }
  function rate(ip,key,max){
    const now=Date.now();let entry=limits.get(ip);
    if(!entry||now-entry.since>=60000){entry={since:now,create:0,join:0};limits.set(ip,entry);}
    entry[key]++;return entry[key]<=max;
  }
  function attach(ws,room,side,player){
    clearTimeout(ws.joinTimer);
    if(player.ws&&player.ws!==ws){const old=player.ws;old.session=null;old.close(4001,'Connected elsewhere');}
    ws.session={room,side,player};player.ws=ws;player.disconnectedAt=null;player.ready=false;ws.encoder=createEncoder();
    send(ws,{type:'welcome',room:room.code,side,token:player.token,seq:player.seq,protocol:1});phase(room);
  }
  wss.on('connection',(ws,req)=>{
    connections.add(ws);ws.alive=true;
    ws.joinTimer=setTimeout(()=>{if(!ws.session)ws.close(1008,'Join timeout');},joinTimeoutMs);
    const ip=req.socket.remoteAddress;let pending=false,windowAt=Date.now(),messages=0;
    ws.on('pong',()=>{ws.alive=true;});
    ws.on('error',()=>{});
    ws.on('message',async data=>{
      if(Date.now()-windowAt>=1000){windowAt=Date.now();messages=0;}
      if(++messages>50){fail(ws,'rate-limit');return;}
      let msg;try{msg=JSON.parse(data.toString());}catch(_){fail(ws,'invalid-message');return;}
      if(!msg||typeof msg!=='object'||pending){fail(ws,'busy');return;}
      if(!ws.session){
        if(!['create','join','resume'].includes(msg.type)){fail(ws,'join-required');return;}
        if(msg.protocol!==1){fail(ws,'version-mismatch');return;}
        if(msg.type==='create'){
          if(!rate(ip,'create',5)||rooms.size>=maxRooms){fail(ws,'server-full');return;}
          // This client has joined the protocol. A cold simulation can take
          // longer than the idle handshake deadline on a small free server;
          // its bounded browser startup timeout now governs this request.
          clearTimeout(ws.joinTimer);
          pending=true;
          const room={code:code(),createdAt:Date.now(),players:{},commands:[],busy:false,phase:'waiting',steps:0};
          while(rooms.has(room.code))room.code=code();
          rooms.set(room.code,room);
          try{
            room.sim=await host.create();
            if(ws.readyState!==WebSocket.OPEN){await closeRoom(room,'host-left');return;}
            const player={token:token(),seq:0,ready:false};room.players.france=player;attach(ws,room,'france',player);
          }catch(e){console.error('Could not create match:',e.message);await closeRoom(room,'server-error');fail(ws,'server-error');}
          finally{pending=false;}
          return;
        }
        if(!rate(ip,'join',30)||typeof msg.room!=='string'){fail(ws,'join-limit');return;}
        const room=rooms.get(msg.room.toUpperCase());
        if(!room?.sim||room.closed){fail(ws,'room-not-found');return;}
        if(msg.type==='resume'){
          const side=typeof msg.token==='string'&&/^[a-f0-9]{64}$/.test(msg.token)&&['france','britain'].find(s=>room.players[s]&&room.players[s].token===msg.token);
          if(!side){fail(ws,'invalid-session');return;}
          attach(ws,room,side,room.players[side]);return;
        }
        if(room.players.britain){fail(ws,'room-full');return;}
        const player={token:token(),seq:0,ready:false};room.players.britain=player;attach(ws,room,'britain',player);return;
      }
      const {room,side,player}=ws.session;
      if(room.closed)return;
      if(msg.type==='ready'){player.ready=true;phase(room);return;}
      if(msg.type==='leave'){await closeRoom(room,'player-left');return;}
      if(msg.type!=='command'){fail(ws,'invalid-message');return;}
      if(room.phase!=='playing'){fail(ws,'match-paused');return;}
      const normalized=protocol.normalize(msg.command);
      if(!normalized.ok){fail(ws,normalized.reason);return;}
      if(room.commands.length>=128){fail(ws,'rate-limit');return;}
      // Side is bound to the connection and is never read from client data.
      room.commands.push({side,command:normalized.command});
    });
    ws.on('close',()=>{
      clearTimeout(ws.joinTimer);
      connections.delete(ws);const session=ws.session;if(!session)return;
      const {room,player}=session;if(player.ws===ws){player.ws=null;player.ready=false;player.disconnectedAt=Date.now();if(!room.closed)phase(room);}
    });
  });
  await new Promise(resolve=>server.listen(options.port??Number(process.env.PORT||8080),options.bind??'0.0.0.0',resolve));
  const address=server.address();
  try{host=options.simulationHost||await createSimulationHost({baseURL:`http://127.0.0.1:${address.port}`});}
  catch(e){server.close();throw e;}
  const clock=setInterval(()=>{
    for(const room of rooms.values()){
      if(room.closed||room.busy||!room.sim)continue;
      const now=Date.now();
      if(now-room.createdAt>2*60*60*1000||(room.finished&&now-room.finishedAt>300000)||Object.values(room.players).some(p=>p.disconnectedAt&&now-p.disconnectedAt>90000)||(!room.started&&now-room.createdAt>600000)){void closeRoom(room,'expired');continue;}
      const advance=room.phase==='playing';
      const snapshot=!room.lastSnapshotAt||now-room.lastSnapshotAt>=(advance?100:500);
      if(!advance&&!snapshot)continue;
      if(snapshot)room.lastSnapshotAt=now;
      const at=performance.now(),seconds=advance?Math.min(.25,Math.max(0,(at-(room.lastAdvanceAt??at))/1000)):0;
      if(advance)room.lastAdvanceAt=at;
      room.steps++;
      room.busy=true;
      const commands=room.commands.splice(0,128);
      room.sim.advance(commands,advance,snapshot,seconds).then(result=>{
        if(room.closed)return;
        for(const ack of result.receipts){const p=room.players[ack.side];if(ack.ok)p.seq=Math.max(p.seq,ack.seq);if(p.ws)send(p.ws,{type:'receipt',...ack});}
        if(!result.views)return;
        if(result.views.france.state.gameOver&&!room.finished){room.finished=true;room.finishedAt=Date.now();phase(room);}
        for(const side of ['france','britain']){
          const p=room.players[side],ws=p?.ws;if(!ws||ws.readyState!==WebSocket.OPEN)continue;
          if(ws.bufferedAmount>512*1024){ws.close(4002,'Connection too slow');continue;}
          send(ws,ws.encoder.encode(result.views[side]));
        }
      }).catch(e=>{console.error('Match failed:',e.message);void closeRoom(room,'server-error');}).finally(()=>{room.busy=false;});
    }
  },50);
  const heartbeat=setInterval(()=>{
    for(const ws of connections){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}
    for(const [ip,entry]of limits)if(Date.now()-entry.since>120000)limits.delete(ip);
  },20000);
  return {server,rooms,address,closeRoom:code=>{const room=rooms.get(code);return room?closeRoom(room,'player-left'):Promise.resolve();},
    async close(){closing=true;clearInterval(clock);clearInterval(heartbeat);for(const room of [...rooms.values()])await closeRoom(room,'server-stopped');for(const ws of connections)ws.terminate();await host.close();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
  };
}
if(require.main===module){createServer().then(app=>{console.log(`Napoleonic RTS multiplayer listening on ${app.address.port}`);let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;app.close().finally(()=>process.exit(0));});}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={createServer};
