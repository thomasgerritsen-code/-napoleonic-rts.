'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {bundlePlay,planBundles,topLevelNames,isStrict}=require('../../scripts/bundle-play');
const ROOT=path.resolve(__dirname,'../..');

function site(files,tags){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bundle-play-'));
 fs.mkdirSync(path.join(dir,'src'));
 for(const[name,code]of Object.entries(files))fs.writeFileSync(path.join(dir,'src',name),code);
 fs.writeFileSync(path.join(dir,'play.html'),`<head>\n${tags}\n</head>\n`);
 return dir;
}

test('top-level names come from the parser, not from nested code',()=>{
 const names=topLevelNames(`'use strict';\nconst A=1,B=2;let C;var D;\nfunction E(){const inner=1;}\nclass F{}\n(function(){const hidden=1;})();\nif(1){let block=2;}`);
 assert.deepEqual(names.sort(),['A','B','C','D','E','F']);
 assert.equal(isStrict(`// note\n/* more */\n'use strict';x=1`),true);
 assert.equal(isStrict(`x=1;'use strict'`),false);
});

test('a script whose names an earlier script mentions starts a new bundle',()=>{
 const dir=site({
  'a.js':`'use strict';\nfunction a(){return typeof later==='function';}\n`,
  'b.js':`'use strict';\nconst b=a();\n`,
  'c.js':`'use strict';\nfunction later(){}\n`,
  'd.js':`'use strict';\nconst d=later;\n`,
  'loose.js':`var loose=1;\n`,
  'e.js':`'use strict';\nconst e=1;\n`,
  'f.js':`'use strict';\nconst f=e;\n`
 },['a','b','c','d','loose','e','f'].map(n=>`<script src="src/${n}.js?build=x"></script>`).join('\n')
  .replace('<script src="src/e.js','<script>inline()</script>\n<script src="src/e.js'));
 const plan=planBundles(dir,fs.readFileSync(path.join(dir,'play.html'),'utf8'));
 assert.deepEqual(plan.map(c=>c.items.map(i=>path.basename(i.file))),[['a.js','b.js'],['c.js','d.js'],['e.js','f.js']]);
 const result=bundlePlay(dir);
 const html=fs.readFileSync(path.join(dir,'play.html'),'utf8');
 const order=[...html.matchAll(/<script(?: src="([^"]+)")?>/g)].map(m=>m[1]||'inline');
 assert.equal(order.length,5);
 assert.match(order[0],/^bundle\/play-0\.[0-9a-f]{12}\.js$/);
 assert.match(order[1],/^bundle\/play-1\.[0-9a-f]{12}\.js$/);
 assert.equal(order[2],'src/loose.js?build=x');
 assert.equal(order[3],'inline');
 assert.match(order[4],/^bundle\/play-2\.[0-9a-f]{12}\.js$/);
 assert.equal(result.reduce((n,c)=>n+c.scripts,0),6);
 const first=fs.readFileSync(path.join(dir,order[0]),'utf8');
 assert.ok(first.indexOf('function a()')<first.indexOf('const b=a()'));
});

test('play.html bundles every classic script once, in page order',()=>{
 const html=fs.readFileSync(path.join(ROOT,'play.html'),'utf8');
 const tags=[...html.matchAll(/<script src="(src\/[^"?]+\.js)(?:\?[^"]*)?"><\/script>/g)].map(m=>m[1]);
 const plan=planBundles(ROOT,html);
 const planned=plan.flatMap(c=>c.items.map(i=>i.file));
 const loose=tags.filter(f=>!planned.includes(f));
 assert.deepEqual(planned,tags.filter(f=>!loose.includes(f)));
 for(const f of loose)assert.equal(isStrict(fs.readFileSync(path.join(ROOT,f),'utf8')),false,f);
 assert.ok(plan.length<tags.length/4,`${plan.length} bundles for ${tags.length} scripts`);
});
