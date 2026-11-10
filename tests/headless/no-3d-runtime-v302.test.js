const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function allFiles(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item => {
    const full = path.join(dir,item.name);
    return item.isDirectory() ? allFiles(full) : [full];
  });
}
test('the 2D-only game contains no 3D renderer source or Three.js runtime entrypoints', () => {
  const html = fs.readFileSync(path.join(root,'play.html'),'utf8');
  const css = fs.readFileSync(path.join(root,'style.css'),'utf8');
  const code = allFiles(path.join(root,'src')).filter(file => /\.(m?js)$/.test(file));
  assert.equal(code.filter(file => /battlefield-3d-/i.test(file)).length,0);
  assert.doesNotMatch(html,/battlefield-3d|type="importmap"|three\.module\.js|battlefield3d/i);
  assert.doesNotMatch(css,/\.battlefield-3d-canvas|\.render-mode-button/);
  const symbols=/__BATTLEFIELD_3D|NRTS_3D_SOURCE|__NRTS_THREE_SCENE__|renderModeBtn|battlefield3d|from ['"]three['"]/;
  const leftovers = code.filter(file => symbols.test(fs.readFileSync(file,'utf8')))
    .map(file => path.relative(root,file));
  assert.deepEqual(leftovers, [], 'Runtime still references the retired 3D renderer');
});
