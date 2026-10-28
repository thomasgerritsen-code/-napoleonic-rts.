'use strict';

// Deployment only: joins play.html's ~200 classic scripts into a few bundles,
// so a phone fetches (and revalidates) a handful of files instead of hundreds.
// The repository keeps the separate scripts; local play and the tests use them.
//
// Joining scripts is only safe where it changes nothing. Separate scripts see
// a later script's names only once it has run; inside one script, functions
// are hoisted to its start and let/const/class sit in their dead zone from it.
// So a new bundle starts at every script whose top-level names appear anywhere
// in an earlier script (counted generously: comments and strings included).
// The top-level names come from V8 itself: a script compiled with a probe
// `let name;` behind it fails with "Identifier 'name' has already been
// declared" exactly for its own top-level declarations.
// Only plain, strict classic scripts are joined: a sloppy one, a module or an
// inline script stays as it is and closes the bundle before it.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const TAG = /<script src="(src\/[^"?]+\.js)(\?[^"]*)?"><\/script>/g;
const WORD = /[A-Za-z_$][\w$]*/g;

function isStrict(source) {
  const body = source.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  return /^(['"])use strict\1/.test(body);
}

const validName = new Map();
function canDeclare(name) {
  if (!validName.has(name)) {
    try { new vm.Script(`'use strict';let ${name};`); validName.set(name, true); } catch { validName.set(name, false); }
  }
  return validName.get(name);
}

function topLevelNames(source, file = 'script') {
  let probe = [...new Set(source.match(WORD) || [])].filter(canDeclare);
  const names = [];
  for (;;) {
    try {
      new vm.Script(`${source}\n;let ${probe.length ? probe.join(',') : '__probe__'};`, { filename: file });
      return names;
    } catch (error) {
      const hit = /Identifier '([^']+)' has already been declared/.exec(error.message)?.[1];
      if (!hit || !probe.includes(hit)) throw new Error(`${file}: cannot read its top-level names (${error.message})`);
      names.push(hit);
      probe = probe.filter(name => name !== hit);
    }
  }
}

function planBundles(root, html) {
  const items = [];
  let last = 0, match;
  TAG.lastIndex = 0;
  while ((match = TAG.exec(html))) {
    items.push({ gap: html.slice(last, match.index), tag: match[0], file: match[1], start: match.index });
    last = TAG.lastIndex;
  }
  const chunks = [];
  let chunk = null, seen = '';
  for (const item of items) {
    const source = fs.readFileSync(path.join(root, item.file), 'utf8');
    // Anything but whitespace between two tags (an inline script, a module)
    // must run between them, as must a script that is not strict.
    if (chunk && item.gap.trim()) chunk = null;
    if (!isStrict(source)) { chunk = null; seen += `\n${source}`; continue; }
    const names = topLevelNames(source, item.file);
    const clash = names.find(name => new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(seen));
    if (!chunk || clash) { chunk = { items: [], reason: chunk ? `${clash} in ${item.file}` : 'start' }; chunks.push(chunk); }
    chunk.items.push(Object.assign(item, { source }));
    seen += `\n${source}`;
  }
  return chunks;
}

function bundlePlay(root, { page = 'play.html', outDir = 'bundle' } = {}) {
  const htmlPath = path.join(root, page);
  let html = fs.readFileSync(htmlPath, 'utf8');
  const chunks = planBundles(root, html);
  fs.mkdirSync(path.join(root, outDir), { recursive: true });
  const edits = [];
  chunks.forEach((chunk, index) => {
    if (chunk.items.length < 2) return;
    const code = chunk.items.map(item => `${item.source}\n;// ${item.file}\n`).join('');
    const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 12);
    const name = `${outDir}/play-${index}.${hash}.js`;
    fs.writeFileSync(path.join(root, name), code);
    chunk.items.forEach((item, i) => edits.push({ start: item.start, end: item.start + item.tag.length, text: i ? '' : `<script src="${name}"></script>` }));
    chunk.file = name;
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    // A removed tag takes its line break with it.
    const end = edit.text ? edit.end : edit.end + (html[edit.end] === '\n' ? 1 : 0);
    html = html.slice(0, edit.start) + edit.text + html.slice(end);
  }
  fs.writeFileSync(htmlPath, html);
  return chunks.map(chunk => ({ file: chunk.file || chunk.items[0].file, scripts: chunk.items.length, reason: chunk.reason }));
}

// Copies the site into outDir (Vercel serves a build's output folder), leaving
// out what is never served.
const NOT_SERVED = new Set(['.git', 'node_modules', 'public', '.vercel', 'playwright-report', 'test-results']);
function copySite(root, outDir) {
  const out = path.resolve(root, outDir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const entry of fs.readdirSync(root)) {
    if (NOT_SERVED.has(entry)) continue;
    fs.cpSync(path.join(root, entry), path.join(out, entry), { recursive: true });
  }
  return out;
}

if (require.main === module) {
  const at = process.argv.indexOf('--out');
  const repo = path.resolve(__dirname, '..');
  const root = at > 0 ? copySite(repo, process.argv[at + 1]) : repo;
  const result = bundlePlay(root);
  const scripts = result.reduce((sum, chunk) => sum + chunk.scripts, 0);
  console.log(`Bundled ${scripts} scripts into ${result.length} files`);
  for (const chunk of result) console.log(`  ${chunk.file}: ${chunk.scripts} scripts (${chunk.reason})`);
}

module.exports = { bundlePlay, planBundles, topLevelNames, isStrict, copySite };
