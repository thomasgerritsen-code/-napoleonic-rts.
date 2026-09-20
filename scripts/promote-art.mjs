#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const PROVENANCE_PATH = path.join(ROOT, 'assets', 'generated', 'provenance.json');

function parseArgs(argv) {
  const args = { manifest: null, localPath: null, assetId: null, target: null, note: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--manifest') args.manifest = argv[++i];
    else if (token === '--file') args.localPath = argv[++i];
    else if (token === '--asset-id') args.assetId = argv[++i];
    else if (token === '--target') args.target = argv[++i];
    else if (token === '--note') args.note = argv[++i];
    else if (token === '--help' || token === '-h') {
      console.log('Usage: node scripts/promote-art.mjs --manifest art/generated/<run>/manifest.json --file art/generated/<run>/<category>/<file>.png --asset-id french-line-v1 [--target assets/generated/units/french-line-v1.png] [--note "crop/recolour planned"]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest || !args.localPath || !args.assetId) throw new Error('--manifest, --file and --asset-id are required.');

  const manifestPath = path.resolve(args.manifest);
  const sourcePath = path.resolve(args.localPath);
  await access(sourcePath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const normalizedSource = path.normalize(path.relative(ROOT, sourcePath));
  const match = manifest.outputs.find((entry) => (entry.files || []).some((file) => path.normalize(file.localPath) === normalizedSource));
  if (!match) throw new Error('Selected file is not recorded in the supplied generation manifest.');
  const sourceRecord = match.files.find((file) => path.normalize(file.localPath) === normalizedSource);

  const extension = path.extname(sourcePath) || '.png';
  const targetRelative = args.target || path.join('assets', 'generated', match.category, `${args.assetId}${extension}`);
  const targetPath = path.resolve(ROOT, targetRelative);
  if (!targetPath.startsWith(path.resolve(ROOT, 'assets') + path.sep)) throw new Error('Promotion target must remain under assets/.');
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const provenance = await loadJson(PROVENANCE_PATH, { schemaVersion: 1, assets: [] });
  const existingIndex = provenance.assets.findIndex((asset) => asset.assetId === args.assetId && !asset.supersededBy);
  const now = new Date().toISOString();
  if (existingIndex >= 0) provenance.assets[existingIndex].supersededBy = `${args.assetId}@${now}`;

  const provider = manifest.provider || 'fal';
  provenance.assets.push({
    recordId: `${args.assetId}@${now}`,
    assetId: args.assetId,
    sourceType: 'generated',
    sourceTool: provider === 'leonardo' ? 'Leonardo.ai' : provider === 'fal' ? 'fal.ai' : provider,
    provider,
    providerEndpoint: manifest.endpoint,
    model: manifest.model || manifest.endpoint,
    modelLabel: manifest.modelLabel || null,
    generationRunId: manifest.runId,
    generationConfigVersion: manifest.configVersion,
    prompt: match.prompt,
    systemPrompt: match.systemPrompt,
    seed: match.seed,
    originalGeneratedUrl: sourceRecord.sourceUrl,
    generatedAt: manifest.createdAt,
    promotedAt: now,
    editor: 'project art pipeline',
    usageReview: 'Generated asset. Confirm current provider/model usage terms before shipping; no third-party license is asserted by this manifest.',
    transformations: args.note ? [args.note] : [],
    targetScaleAnchorFacing: 'TBD during in-game integration; must be recorded before production merge.',
    currentFilePath: path.relative(ROOT, targetPath),
    introducedGameVersion: packageJson.version,
    introducedFromCommit: gitHead(),
    supersededBy: null
  });

  await mkdir(path.dirname(PROVENANCE_PATH), { recursive: true });
  await writeFile(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  console.log(`Promoted ${normalizedSource} -> ${path.relative(ROOT, targetPath)}`);
  console.log(`Provenance updated: ${path.relative(ROOT, PROVENANCE_PATH)}`);
}

main().catch((error) => {
  console.error(`Promotion failed: ${error.message}`);
  process.exitCode = 1;
});
