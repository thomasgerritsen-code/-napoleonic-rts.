#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'art-pipeline', 'prompts.json');
const DEFAULT_OUT = path.join(ROOT, 'art', 'generated');

function parseArgs(argv) {
  const args = {
    categories: [],
    all: false,
    dryRun: false,
    confirm: false,
    variants: null,
    seedBase: null,
    resolution: null,
    aspect: null,
    outputDir: DEFAULT_OUT,
    maxGenerations: 4,
    list: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--all') args.all = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--confirm') args.confirm = true;
    else if (token === '--list') args.list = true;
    else if (token === '--category') args.categories.push(argv[++i]);
    else if (token === '--variants') args.variants = Number(argv[++i]);
    else if (token === '--seed-base') args.seedBase = Number(argv[++i]);
    else if (token === '--resolution') args.resolution = argv[++i];
    else if (token === '--aspect') args.aspect = argv[++i];
    else if (token === '--out') args.outputDir = path.resolve(argv[++i]);
    else if (token === '--max-generations') args.maxGenerations = Number(argv[++i]);
    else if (token === '--help' || token === '-h') {
      console.log(`Usage:\n  node scripts/generate-art.mjs --category style-keyframe [--variants 2] [--dry-run]\n  node scripts/generate-art.mjs --all --confirm --max-generations 18\n\nOptions:\n  --list                 List available categories\n  --category ID          Generate one category; repeatable\n  --all                  Generate all configured categories\n  --variants N           Override variants per category\n  --seed-base N          Override base seed for selected categories\n  --resolution 1K|2K|4K Override configured resolution\n  --aspect RATIO         Override aspect ratio, e.g. 16:9\n  --out PATH             Generated draft output directory\n  --dry-run              Print requests without calling fal\n  --max-generations N    Hard cap on image generations (default: 4)\n  --confirm              Required for non-dry --all runs\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function isoRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
}

function selectedCategories(config, args) {
  if (args.all) return config.categories;
  const wanted = new Set(args.categories.filter(Boolean));
  return config.categories.filter((entry) => wanted.has(entry.id));
}

function buildPrompt(config, category) {
  return `${category.prompt}\n\n${config.avoid}`;
}

async function falSubmit(endpoint, input, key) {
  const response = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`fal submit failed ${response.status}: ${await response.text()}`);
  return response.json();
}

async function falGet(url, key) {
  const response = await fetch(url, { headers: { Authorization: `Key ${key}` } });
  if (!response.ok) throw new Error(`fal request failed ${response.status}: ${await response.text()}`);
  return response.json();
}

async function waitForFal(job, key) {
  if (!job.status_url) throw new Error('fal response did not include status_url');
  while (true) {
    const status = await falGet(job.status_url, key);
    process.stdout.write(`  ${status.status}${Number.isInteger(status.queue_position) ? ` (queue ${status.queue_position})` : ''}\n`);
    if (status.status === 'COMPLETED') {
      const resultUrl = status.response_url || job.response_url;
      if (!resultUrl) throw new Error('fal completed without response_url');
      return falGet(resultUrl, key);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();

  if (args.list) {
    for (const item of config.categories) console.log(`${item.id}\tdefault variants=${item.variants}`);
    return;
  }

  const categories = selectedCategories(config, args);
  if (!args.all && args.categories.length === 0) {
    console.error('Choose --category ID or --all. Use --list to inspect categories.');
    process.exitCode = 2;
    return;
  }
  if (categories.length === 0) throw new Error('No matching categories selected.');
  if (args.categories.length && categories.length !== new Set(args.categories).size) {
    const known = new Set(config.categories.map((entry) => entry.id));
    const missing = [...new Set(args.categories)].filter((id) => !known.has(id));
    throw new Error(`Unknown categories: ${missing.join(', ')}`);
  }

  const plan = categories.map((category) => ({
    ...category,
    variants: args.variants ?? category.variants ?? 1,
  }));
  const generationCount = plan.reduce((sum, category) => sum + category.variants, 0);
  if (!Number.isInteger(generationCount) || generationCount < 1) throw new Error('Invalid variants count.');
  if (generationCount > args.maxGenerations) {
    throw new Error(`Planned ${generationCount} generations exceeds --max-generations ${args.maxGenerations}. Raise the cap deliberately.`);
  }
  if (args.all && !args.dryRun && !args.confirm) {
    throw new Error('Non-dry --all requires --confirm to reduce accidental generation spend.');
  }

  const key = process.env.FAL_KEY;
  if (!args.dryRun && !key) throw new Error('FAL_KEY is required. Export it in the shell; never commit it.');

  const runId = isoRunId();
  const runDir = path.join(args.outputDir, runId);
  const manifest = {
    schemaVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    endpoint: config.endpoint,
    configVersion: config.version,
    dryRun: args.dryRun,
    outputs: [],
  };

  console.log(`Art run ${runId}: ${generationCount} planned generation(s) using ${config.endpoint}`);

  let ordinal = 0;
  for (const category of plan) {
    for (let variant = 0; variant < category.variants; variant += 1) {
      ordinal += 1;
      const base = args.seedBase ?? category.seedBase ?? 1000;
      const seed = base + variant;
      const input = {
        ...config.requestDefaults,
        prompt: buildPrompt(config, category),
        system_prompt: config.systemPrompt,
        seed,
        num_images: 1,
      };
      if (args.resolution) input.resolution = args.resolution;
      if (args.aspect) input.aspect_ratio = args.aspect;

      console.log(`[${ordinal}/${generationCount}] ${category.id} seed=${seed}`);
      if (args.dryRun) {
        console.log(JSON.stringify({ endpoint: config.endpoint, input }, null, 2));
        manifest.outputs.push({ category: category.id, variant, seed, input, status: 'dry-run' });
        continue;
      }

      const job = await falSubmit(config.endpoint, input, key);
      const result = await waitForFal(job, key);
      const images = Array.isArray(result.images) ? result.images : [];
      if (images.length === 0) throw new Error(`No images returned for ${category.id} seed=${seed}`);

      const saved = [];
      for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
        const image = images[imageIndex];
        const extension = image.content_type === 'image/jpeg' ? 'jpg' : image.content_type === 'image/webp' ? 'webp' : 'png';
        const fileName = `${safeName(category.id)}__seed-${seed}__${imageIndex + 1}.${extension}`;
        const relative = path.join(category.id, fileName);
        const absolute = path.join(runDir, relative);
        await download(image.url, absolute);
        saved.push({
          sourceUrl: image.url,
          localPath: path.relative(ROOT, absolute),
          width: image.width ?? null,
          height: image.height ?? null,
          contentType: image.content_type ?? null,
        });
      }

      manifest.outputs.push({
        category: category.id,
        variant,
        seed,
        prompt: input.prompt,
        systemPrompt: input.system_prompt,
        request: input,
        requestId: job.request_id ?? null,
        modelDescription: result.description ?? null,
        files: saved,
        status: 'completed',
      });
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  }

  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Done. Manifest: ${path.relative(ROOT, path.join(runDir, 'manifest.json'))}`);
}

main().catch((error) => {
  console.error(`Art pipeline failed: ${error.message}`);
  process.exitCode = 1;
});
