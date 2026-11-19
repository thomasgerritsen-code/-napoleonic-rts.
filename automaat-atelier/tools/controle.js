// Controles voor de Automaat Atelier (zonder scherm): node tools/controle.js <map voor cache> <model> [snel|volledig]
// snel: spelingcontrole alleen voor veranderde onderdelen (12 standen, uitkomst van de rest uit de cache), plus beweging, printbaarheid, dicht en driehoekrichting (±1 min).
// volledig: alles opnieuw in 24 standen (±8 min). Vereist playwright en three.js r128 (npm pack three@0.128.0) in THREE_DIR.
const THREE_DIR=process.env.THREE_DIR||(process.argv[2]+'/package');
// snelle/volledige spelingcontrole met cache: node clrq.js SP preset [snel|volledig]
const {chromium}=require('playwright'); const fs=require('fs'); const SP=process.argv[2], PRE=process.argv[3]||'manta60', MODE=process.argv[4]||'snel', CF=SP+'/clrcache_'+PRE+'.json';
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader']});const p=await b.newPage();p.on('pageerror',e=>console.log('PE',String(e).slice(0,300)));
await p.route('**/three.min.js',r=>r.fulfill({path:THREE_DIR+'/build/three.min.js'}));await p.route('**/OrbitControls.js',r=>r.fulfill({path:THREE_DIR+'/examples/js/controls/OrbitControls.js'}));await p.route('https://fonts.**',r=>r.abort());
await p.addInitScript(()=>{ window.__noRender=true; window.__noAutoCheck=true; }); await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+'#alle');await p.waitForTimeout(800);await p.evaluate((k)=>document.querySelector('button[data-k='+k+']').click(),PRE);
await p.waitForFunction(()=>window.__AA.M.hinges&&window.__AA.M.hinges.some(h=>h.pinLen)&&!window.__AA.M.pinsPending,null,{timeout:300000}); await p.waitForTimeout(500);
const t0=Date.now(); const keys=await p.evaluate(()=>window.__AA.clrKeys()); let old=null; try{ old=JSON.parse(fs.readFileSync(CF,'utf8')); }catch(e){}
const full=MODE==='volledig'||!old; const prev=new Set(old?old.keys:[]), changed=keys.filter(k=>!prev.has(k));
if(!full&&!changed.length){ console.log('niets veranderd; vorige uitkomst geldt ('+old.res.length+' meldingen)'); } else {
 await p.evaluate(([full,changed])=>{ window.__AA.runClr(full?{steps:24,only:true}:{steps:12,changed,only:true}); },[full,changed]);
 await p.waitForFunction(()=>window.__AA.clr().state==='done',null,{timeout:1800000});
 const C=await p.evaluate(()=>{ const C=window.__AA.clr(); return {res:C.res,checked:C.checked,pairs:C.pairs,thr:C.thr}; });
 const chk=new Set(C.checked), now=new Set(keys.map(k=>k.split('#')[0])), keep=full?[]:(old.res||[]).filter(r=>!chk.has([r.a,r.b].sort().join('|'))&&now.has(r.a)&&now.has(r.b));
 const res=[...keep,...C.res].sort((x,y)=>x.d-y.d); fs.writeFileSync(CF,JSON.stringify({keys,res,thr:C.thr,full:full?Date.now():(old&&old.full)}));
 console.log((full?'VOLLEDIG (24 standen)':'SNEL (12 standen) '+changed.length+' veranderde onderdelen')+', '+C.pairs+' paren gemeten, '+((Date.now()-t0)/1000).toFixed(0)+' s');
 const raakt=res.filter(r=>r.d<0.05); console.log('SPELING: '+(raakt.length?raakt.length+' RAAKT':'geen overlap')+', krapst '+(res[0]?res[0].a+'|'+res[0].b+' '+res[0].d.toFixed(2):'-')); for(const r of raakt) console.log('  RAAKT '+r.a+' | '+r.b+' '+r.d.toFixed(2)+' @'+r.ang); }
const t1=Date.now(); await p.evaluate(()=>window.__AA.runMot()); await p.waitForFunction(()=>window.__AA.mot().state==='done',null,{timeout:600000});
console.log('BEWEGING: '+await p.evaluate(()=>{ const m=window.__AA.mot(); return m.res.length?m.res.length+' pennen met afwijking: '+m.res.map(r=>r.tags.join('/')).join('; '):'alle '+m.n+' pennen in orde'; })+' ('+((Date.now()-t1)/1000).toFixed(0)+' s)');
const t2=Date.now(); await p.evaluate(()=>window.__AA.runPrc()); await p.waitForFunction(()=>window.__AA.prc().state==='done',null,{timeout:900000});
console.log('PRINT: '+await p.evaluate(()=>{ const r=window.__AA.prc().res, L=window.__AA.prc().lvl; const bad=r.filter(x=>L&&L.get(x.id)==='bad').map(x=>x.code+' '+x.name.split(' (')[0]); return (r.length-bad.length)+'/'+r.length+' zonder probleem'+(bad.length?'; PROBLEEM: '+bad.join(', '):''); })+' ('+((Date.now()-t2)/1000).toFixed(0)+' s)');
console.log('DICHT/RICHTING: '+await p.evaluate(()=>{ const A=window.__AA, open=[], wind=[]; for(const pt of A.PARTS){ const a=pt.printGeo.attributes.position.array, f3=(x)=>(Math.abs(x)<5e-4?0:x).toFixed(3), key=(i)=>f3(a[i])+','+f3(a[i+1])+','+f3(a[i+2]), m=new Map(); for(let t=0;t<a.length;t+=9){ const k=[key(t),key(t+3),key(t+6)]; for(let e=0;e<3;e++){ const u=k[e], v=k[(e+1)%3]; if(u===v) continue; const kk=u<v?u+'|'+v:v+'|'+u; m.set(kk,(m.get(kk)||0)+1); } } let n1=0; for(const c of m.values()) if(c%2) n1++; if(n1) open.push(pt.code+':'+n1); if(A.pb.badWinding(pt.printGeo)) wind.push(pt.code); } return (open.length?'open randen: '+open.join(' '):'alles dicht')+'; '+(wind.length?'verkeerd gericht: '+wind.join(' '):'alle driehoeken goed gericht'); }));
console.log('TOTAAL '+((Date.now()-t0)/1000).toFixed(0)+' s');
await b.close();})();
