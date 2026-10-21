'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('v321 French raster art draft: real atlas frame data and visual-review gate are valid',()=>{
  const root=path.resolve(__dirname,'../..');
  const run=spawnSync('python3',[path.join(root,'tests/headless/french_raster_review_v321_cases.py'),'-v'],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(run.error,undefined,String(run.error));
  assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
  assert.match(run.stderr,/Ran 4 tests/);
  assert.match(run.stderr,/OK/);
});
