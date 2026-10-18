'use strict';

/* v287: PR impact classification. Unknown/critical changes fail closed (all gates).
   Main pushes, release branches and manually dispatched workflows always run all gates. */
const fs = require('node:fs');
const cp = require('node:child_process');

function changedLines(diff) {
  return String(diff || '').split('\n')
    .filter(line => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line))
    .map(line => ({sign:line[0], line:line.slice(1).trim()}));
}
function equivalentlyChanged(diff, accepted, normalize) {
  const lines = changedLines(diff);
  if (!lines.length || lines.some(x => !accepted(x.line))) return false;
  const old = lines.filter(x => x.sign === '-').map(x => normalize(x.line)).sort();
  const next = lines.filter(x => x.sign === '+').map(x => normalize(x.line)).sort();
  return old.length > 0 && old.length === next.length && old.every((value, i) => value === next[i]);
}
function metadataOnlyIndex(diff) {
  return equivalentlyChanged(diff,
    line => /<title>Napoleonic RTS v\d+\.\d+\.\d+<\/title>/.test(line) ||
      /<span class="version">v\d+\.\d+\.\d+<\/span>/.test(line) ||
      /<script\b[^>]*src="[^"]+"\s*><\/script>/.test(line),
    line => line.replace(/Napoleonic RTS v\d+\.\d+\.\d+/g, 'Napoleonic RTS vVERSION')
      .replace(/(<span class="version">v)\d+\.\d+\.\d+/g, '$1VERSION')
      .replace(/(\?build=)[a-zA-Z0-9._-]+/g, '$1BUILD'));
}
function metadataOnlyVersion(diff) {
  return equivalentlyChanged(diff,
    line => /^const VERSION = '\d+\.\d+\.\d+';$/.test(line),
    line => line.replace(/\d+\.\d+\.\d+/, 'VERSION'));
}
function metadataOnlyPackage(diff) {
  return equivalentlyChanged(diff,
    line => /^"version": "\d+\.\d+\.\d+",?$/.test(line),
    line => line.replace(/\d+\.\d+\.\d+/, 'VERSION'));
}

function classifyImpact(files, opts={}) {
  const event = opts.event || 'pull_request';
  const branch = opts.branch || '';
  const normalized = [...new Set((files || []).map(x => String(x||'').trim()).filter(Boolean))];
  const all = reason => ({focused:true, health:true, movement:true, golden:true, reason});
  if (event !== 'pull_request' || branch.startsWith('release/'))
    return all('Full safety suite on main, manual dispatch or release branch');
  if (!normalized.length) return all('Unknown changes: fail closed');
  const gates={focused:false,health:false,movement:false,golden:false,reason:''};
  const reasons=[];
  for (const file of normalized) {
    if (/^(docs\/|.*\.md$|\.gitignore$|LICENSE$)/.test(file)) continue;
    if (file === 'index.html') {
      if (!metadataOnlyIndex(opts.indexDiff)) return all('HTML bootstrap changes: full verification');
      gates.focused=true; reasons.push('version/cache metadata'); continue;
    }
    if (file === 'package.json') {
      if (!metadataOnlyPackage(opts.packageDiff)) return all('Dependencies/scripts changed');
      continue;
    }
    if (file === 'src/foundation/version.js') {
      if (!metadataOnlyVersion(opts.versionDiff)) return all('Version startup logic changed');
      gates.focused=true; continue;
    }
    if (file === 'style.css' || /^v\d+\.css$/.test(file) || /^src\/assets\//.test(file)) {
      gates.focused=true; continue;
    }
    if (/^tests\/headless\/[^/]+\.test\.js$/.test(file)) continue;
    if (/^tests\/[^/]+\.spec\.js$/.test(file)) {
      gates.focused=true;
      if (/(bridge|water|river|road|movement|traffic|navigation|column|formation|route|village|terrain)/i.test(file))
        gates.movement=true;
      if (/(golden|battle|combat|artillery|cavalry|morale|ai-|victory|win-condition)/i.test(file))
        gates.golden=true;
      if (/(health|performance|stress|soak|large-army|frame)/i.test(file))
        gates.health=true;
      continue;
    }
    if (/^src\/(systems\/(navigation|movement|formation|world)|v0(63|64|65|66|67|68)(\.js|-)|v069-(motion|map)\.js)/.test(file)) {
      gates.focused=true;gates.movement=true;reasons.push('map/navigation/formation');continue;
    }
    if (/^src\/(systems\/(ai|combat|artillery|morale|cavalry)|ai\/|combat-ai\.js|v069-combat\.js|economy\.js)/.test(file)) {
      gates.focused=true;gates.golden=true;
      // The AI can replace road marching orders even without touching movement.js.
      if (/^src\/(ai\/tactics\.js|systems\/ai\/)/.test(file)) gates.movement=true;
      reasons.push('AI/combat');continue;
    }
    if (file === 'src/regiments.js' || /^src\/systems\/input\//.test(file) ||
        file === 'src/input.js' || file === 'src/selection.js') {
      gates.focused=true;gates.movement=true;continue;
    }
    if (/^src\/systems\/(performance|rendering)\//.test(file)) {
      gates.focused=true;gates.health=true;continue;
    }
    if (file === 'src/hud.js' || file === 'src/visibility.js') {
      gates.focused=true;continue;
    }
    // Workflow logic, unclassified runtime, and all other unknown paths must
    // never silently disable a safety check.
    return all('Unclassified/high-risk change: '+file);
  }
  gates.reason = reasons.length ? [...new Set(reasons)].join(', ') :
    gates.focused ? 'Focused browser coverage' : 'Documentation or headless tests only';
  return gates;
}

function diffFor(file, base, head) {
  if (!base || !head || !/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) return '';
  try { return cp.execFileSync('git',['diff','--unified=0',base,head,'--',file],{encoding:'utf8'}); }
  catch { return ''; } // lack of safe diff forces full verification
}

if (require.main===module) {
  const files=fs.readFileSync(0,'utf8').split(/\r?\n/).filter(Boolean);
  const event=process.env.CI_EVENT||'pull_request';
  const base=process.env.CI_BASE_SHA,head=process.env.CI_HEAD_SHA;
  const diffOpts=(event==='pull_request')?{
    indexDiff:files.includes('index.html')?diffFor('index.html',base,head):'',
    packageDiff:files.includes('package.json')?diffFor('package.json',base,head):'',
    versionDiff:files.includes('src/foundation/version.js')?diffFor('src/foundation/version.js',base,head):''
  }:{};
  const result=classifyImpact(files,{event,branch:process.env.CI_HEAD_BRANCH,...diffOpts});
  for(const key of ['focused','health','movement','golden']) {
    const value=String(result[key]);
    console.log(key+'='+value);
    if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');
  }
  console.log('Impact reason:',result.reason,'| Changed files:',files.join(', ')||'(none)');
  if(process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### v287 impact-aware checks\n\n'+
      '| Gate | Run |\n| --- | --- |\n'+
      ['focused','health','movement','golden'].map(k=>'| '+k+' | '+(result[k]?'yes':'skip on this PR')+' |').join('\n')+
      '\n\nReason: '+result.reason+'\n');
}
module.exports={classifyImpact,metadataOnlyIndex,metadataOnlyVersion,metadataOnlyPackage};
