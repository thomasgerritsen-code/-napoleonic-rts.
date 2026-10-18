'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  classifyImpact,metadataOnlyIndex,metadataOnlyVersion,metadataOnlyPackage
}=require('../../scripts/ci-impact');

function flags(files,opts) {
  const {reason,...gates}=classifyImpact(files,opts);
  return gates;
}
const none={focused:false,health:false,movement:false,golden:false};
const full={focused:true,health:true,movement:true,golden:true};

test('docs-only pull request omits browser and heavy simulation gates',()=>{
  assert.deepEqual(flags(['README.md','docs/notes.md']),none);
});
test('movement and bridge changes trigger coverage but not unrelated soak/battle',()=>{
  assert.deepEqual(flags(['src/systems/navigation/route-planner.js']),{
    focused:true,health:false,movement:true,golden:false
  });
  assert.deepEqual(flags(['src/systems/world/map-expansion-v7.js']),{
    focused:true,health:false,movement:true,golden:false
  });
});
test('AI tactics changes also trigger movement to protect march orders',()=>{
  assert.deepEqual(flags(['src/ai/tactics.js']),{
    focused:true,health:false,movement:true,golden:true
  });
});
test('combat and rendering changes trigger only relevant heavy gates',()=>{
  assert.deepEqual(flags(['src/combat-ai.js']),{
    focused:true,health:false,movement:false,golden:true
  });
  assert.deepEqual(flags(['src/systems/performance/large-army-v1.js']),{
    focused:true,health:true,movement:false,golden:false
  });
});
test('changed movement specs and health specs activate their gate',()=>{
  assert.deepEqual(flags(['tests/bridge-column-autosim-v279.spec.js']),{
    focused:true,health:false,movement:true,golden:false
  });
  assert.deepEqual(flags(['tests/game-health-observer.spec.js']),{
    focused:true,health:true,movement:false,golden:false
  });
});
test('unknown or high-risk code/config changes fail closed',()=>{
  for(const path of ['.github/workflows/pages.yml','src/core.js','src/simulation-api.js','mystery.cfg','package-lock.json']){
    assert.deepEqual(flags([path]),full,path);
  }
  assert.deepEqual(flags([]),full);
});
test('main push, manual workflow and release branch always run all gates',()=>{
  for(const scenario of [
    {event:'push'},
    {event:'workflow_dispatch'},
    {event:'pull_request',branch:'release/1.3.35'}
  ])assert.deepEqual(flags(['README.md'],scenario),full);
});
test('version-only package and foundation diffs do not require all five gates',()=>{
  const packageDiff=[
    '--- a/package.json','+++ b/package.json',
    '-  "version": "1.3.34",','+  "version": "1.3.35",'
  ].join('\n');
  const versionDiff=[
    '--- a/src/foundation/version.js','+++ b/src/foundation/version.js',
    "-  const VERSION = '1.3.34';","+  const VERSION = '1.3.35';"
  ].join('\n');
  assert.equal(metadataOnlyPackage(packageDiff),true);
  assert.equal(metadataOnlyVersion(versionDiff),true);
  assert.deepEqual(flags(['package.json','src/foundation/version.js'],
    {packageDiff,versionDiff}),{
      focused:true,health:false,movement:false,golden:false
    });
  assert.equal(metadataOnlyPackage(packageDiff.replace('"version"','"scripts"')),false);
  assert.equal(metadataOnlyVersion(versionDiff.replace("const VERSION","const BOOT")),false);
});
test('cache-busted metadata-only index is safe, but a changed script is full risk',()=>{
  const diff=[
    '--- a/index.html','+++ b/index.html',
    '-  <title>Napoleonic RTS v1.3.34</title>',
    '+  <title>Napoleonic RTS v1.3.35</title>',
    '-    <span class="version">v1.3.34</span>',
    '+    <span class="version">v1.3.35</span>',
    '-<script src="src/foundation/version.js?build=286a"></script>',
    '+<script src="src/foundation/version.js?build=287a"></script>'
  ].join('\n');
  assert.equal(metadataOnlyIndex(diff),true);
  assert.deepEqual(flags(['index.html'],{indexDiff:diff}),{
    focused:true,health:false,movement:false,golden:false
  });
  const changeScripts=diff.replace('src/foundation/version.js?build=287a','src/core.js?build=287a');
  assert.equal(metadataOnlyIndex(changeScripts),false);
  assert.deepEqual(flags(['index.html'],{indexDiff:changeScripts}),full);
});
test('combined independent impacts are unioned, not weakened',()=>{
  assert.deepEqual(flags(['src/systems/navigation/bridge-safety.js','src/combat-ai.js','src/systems/performance/large-army-v1.js']),full);
});
