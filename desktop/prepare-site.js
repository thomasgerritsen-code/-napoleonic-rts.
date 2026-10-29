'use strict';
// Copies what the game serves into desktop/site and bundles play.html's
// scripts there (as online), so the program carries its own copy of the game.
const fs = require('node:fs');
const path = require('node:path');
const { bundlePlay } = require('../scripts/bundle-play');

const REPO = path.resolve(__dirname, '..');
const SITE = path.join(__dirname, 'site');
const SERVED = ['index.html', 'play.html', 'style.css', 'v05.css', 'v06.css', 'v062.css', 'game.js',
  'src', 'vendor', 'graphics-lab', 'assets', 'march-lab'];

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });
for (const entry of SERVED) {
  const from = path.join(REPO, entry);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(SITE, entry), { recursive: true });
}
const chunks = bundlePlay(SITE);
const version = require('../package.json').version;
const pkgPath = path.join(__dirname, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== version) { pkg.version = version; fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`); }
console.log(`desktop/site ready: v${version}, ${chunks.length} script files`);
