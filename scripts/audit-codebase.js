'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'playwright-report', 'test-results']);

function fail(message) {
  throw new Error(`[codebase-audit] ${message}`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertFile(relativePath, source) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) {
    fail(`${source} verwijst naar ontbrekend bestand: ${relativePath}`);
  }
}

function parseEveryJavaScriptFile() {
  const jsFiles = walk(ROOT).filter(file => file.endsWith('.js'));
  const errors = [];
  for (const file of jsFiles) {
    try {
      new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel(file) });
    } catch (error) {
      errors.push(`${rel(file)}: ${error.message}`);
    }
  }
  if (errors.length) fail(`JavaScript parse-fouten:\n${errors.join('\n')}`);
  return jsFiles.map(rel);
}

function readLegacyManifest() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(read('src/foundation/legacy-manifest.js'), {
    filename: 'src/foundation/legacy-manifest.js'
  }).runInContext(sandbox);
  if (!sandbox.NRTS_LEGACY_MANIFEST) fail('legacy manifest kon niet worden geladen');
  return sandbox.NRTS_LEGACY_MANIFEST;
}

function flattenManifestPaths(manifest) {
  const values = [];
  const visit = value => {
    if (typeof value === 'string' && value.startsWith('src/')) values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(manifest);
  return values;
}

function auditIndex(manifest) {
  const html = read('index.html');
  const scriptRefs = [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
    .map(match => match[1].split('?')[0]);

  const duplicates = [...new Set(scriptRefs.filter((item, index) => scriptRefs.indexOf(item) !== index))];
  if (duplicates.length) fail(`dubbele runtime scripts in index.html: ${duplicates.join(', ')}`);
  scriptRefs.forEach(ref => assertFile(ref, 'index.html'));

  const retired = new Set(manifest.retiredFromRuntime || []);
  const retiredLoaded = scriptRefs.filter(ref => retired.has(ref));
  if (retiredLoaded.length) fail(`retired scripts worden opnieuw runtime geladen: ${retiredLoaded.join(', ')}`);

  return scriptRefs;
}

function auditManifest(manifest, jsFiles) {
  const manifestPaths = flattenManifestPaths(manifest);
  manifestPaths.forEach(ref => assertFile(ref, 'legacy manifest'));

  const classified = new Set(manifestPaths);
  const historical = jsFiles.filter(file => /^src\/v\d.*\.js$/.test(file));
  const unclassified = historical.filter(file => !classified.has(file));
  if (unclassified.length) {
    fail(`historische versiebestanden ontbreken in legacy-manifest: ${unclassified.join(', ')}`);
  }

  const forbiddenNewPatch = historical.filter(file => {
    const match = file.match(/^src\/v0?(\d{3,})/);
    return match && Number(match[1]) >= 72;
  });
  if (forbiddenNewPatch.length) {
    fail(`nieuwe globale versiepatch gedetecteerd; gebruik systems/: ${forbiddenNewPatch.join(', ')}`);
  }
}

function auditVersion() {
  const pkg = JSON.parse(read('package.json'));
  const versionSource = read('src/foundation/version.js');
  const html = read('index.html');
  const sourceMatch = versionSource.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  const titleMatch = html.match(/<title>Napoleonic RTS v([^<]+)<\/title>/);
  const badgeMatch = html.match(/class=["']version["']>v([^<]+)</);

  if (!sourceMatch || !titleMatch || !badgeMatch) fail('versie kon niet uit alle runtimebronnen worden gelezen');
  const versions = {
    package: pkg.version,
    foundation: sourceMatch[1],
    title: titleMatch[1],
    badge: badgeMatch[1]
  };
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) fail(`versies lopen uiteen: ${JSON.stringify(versions)}`);
  return pkg.version;
}

function main() {
  const jsFiles = parseEveryJavaScriptFile();
  const manifest = readLegacyManifest();
  const runtimeScripts = auditIndex(manifest);
  auditManifest(manifest, jsFiles);
  const version = auditVersion();

  console.log(`[codebase-audit] OK — v${version}, ${jsFiles.length} JavaScript-bestanden geparsed, ${runtimeScripts.length} runtime scripts gecontroleerd.`);
}

main();
