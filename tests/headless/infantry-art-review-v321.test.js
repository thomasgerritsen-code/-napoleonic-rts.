'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('v321 raster art QA reports incomplete legs, self-contained gallery and no false approvals',()=>{
 const root=path.resolve(__dirname,'../..');
 const p=spawnSync('python3',[path.join(root,'tests/headless/infantry_art_review_v321_cases.py'),'-v'],{
  cwd:root,encoding:'utf8',timeout:120000
 });
 assert.equal(p.status,0,p.stderr+'\n'+p.stdout);
 assert.match(p.stderr,/Ran 3 tests/);
 assert.match(p.stderr,/OK/);
});
