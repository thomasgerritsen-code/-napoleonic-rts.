#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'art-pipeline', 'prompts.json');
const DEFAULT_OUT = path.join(ROOT, 'art', 'generated');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = {
    categories: [], all: false, dryRun: false, confirm: false, variants: null,
    seedBase: null, resolution: null, aspect: null, provider: null,
    outputDir: DEFAULT_OUT, maxGenerations: 4, list: false,
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
    else if (token === '--provider') args.provider = argv[++i];
    else if (token === '--out') args.outputDir = path.resolve(argv[++i]);
    else if (token === '--max-generations') args.maxGenerations = Number(argv[++i]);
    else if (token === '--help' || token === '-h') {
      console.log(`Usage:\n  node scripts/generate-art.mjs --provider leonardo --category style-keyframe --variants 2\n  node scripts/generate-art.mjs --provider fal --category style-keyframe --dry-run\n  node scripts/generate-art.mjs --all --confirm --max-generations 18\n\nOptions:\n  --provider NAME         leonardo or fal; otherwise ART_PROVIDER/key auto-detection/default\n  --list                  List providers and categories\n  --category ID           Generate one category; repeatable\n  --all                   Generate all configured categories\n  --variants N            Override variants per category\n  --seed-base N           Override base seed\n  --resolution 1K|2K|4K  fal-only resolution override\n  --aspect RATIO          Aspect override; e.g. 16:9\n  --out PATH              Generated draft output directory\n  --dry-run               Print requests without calling a provider\n  --max-generations N     Hard cap on image generations (default: 4)\n  --confirm               Required for non-dry --all runs\n`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
function isoRunId() { return new Date().toISOString().replace(/[:.]/g, '-'); }
async function loadConfig() { return JSON.parse(await readFile(CONFIG_PATH, 'utf8')); }
function selectedCategories(config, args) {
  if (args.all) return config.categories;
  const wanted = new Set(args.categories.filter(Boolean));
  return config.categories.filter((entry) => wanted.has(entry.id));
}

function chooseProvider(config, args) {
  const requested = args.provider || process.env.ART_PROVIDER;
  if (requested) {
    if (!config.providers[requested]) throw new Error(`Unknown provider: ${requested}`);
    return requested;
  }
  if (process.env.LEONARDO_API_KEY && config.providers.leonardo) return 'leonardo';
  if (process.env.FAL_KEY && config.providers.fal) return 'fal';
  return config.defaultProvider;
}

function aspectDimensions(aspect) {
  const table = {
    '16:9': [1536, 864], '3:2': [1536, 1024], '4:3': [1344, 1008],
    '1:1': [1024, 1024], '3:4': [1008, 1344], '2:3': [1024, 1536], '9:16': [864, 1536],
  };
  if (!table[aspect]) throw new Error(`Unsupported Leonardo aspect ratio: ${aspect}`);
  return table[aspect];
}

function buildRequest(config, providerName, category, seed, args) {
  const provider = config.providers[providerName];
  if (provider.kind === 'fal-queue') {
    const input = {
      ...provider.requestDefaults,
      prompt: `${category.prompt}\n\nAvoid: ${config.avoid}`,
      system_prompt: config.systemPrompt,
      seed,
      num_images: 1,
    };
    if (args.resolution) input.resolution = args.resolution;
    if (args.aspect) input.aspect_ratio = args.aspect;
    return input;
  }
  if (provider.kind === 'leonardo-v1') {
    if (args.resolution) throw new Error('--resolution is fal-only; use Leonardo provider defaults or --aspect.');
    const input = {
      ...provider.requestDefaults,
      modelId: provider.modelId,
      prompt: `${config.systemPrompt}\n\n${category.prompt}`,
      negative_prompt: config.avoid,
      seed,
      num_images: 1,
    };
    if (args.aspect) {
      const [width, height] = aspectDimensions(args.aspect);
      input.width = width;
      input.height = height;
    }
    return input;
  }
  throw new Error(`Unsupported provider kind: ${provider.kind}`);
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`request failed ${response.status}: ${await response.text()}`);
  return response.json();
}

async function runFal(provider, input, key) {
  const job = await jsonRequest(`https://queue.fal.run/${provider.endpoint}`, {
    method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!job.status_url) throw new Error('fal response did not include status_url');
  while (true) {
    const status = await jsonRequest(job.status_url, { headers: { Authorization: `Key ${key}` } });
    process.stdout.write(`  ${status.status}${Number.isInteger(status.queue_position) ? ` (queue ${status.queue_position})` : ''}\n`);
    if (status.status === 'COMPLETED') {
      const resultUrl = status.response_url || job.response_url;
      if (!resultUrl) throw new Error('fal completed without response_url');
      const result = await jsonRequest(resultUrl, { headers: { Authorization: `Key ${key}` } });
      return {
        requestId: job.request_id ?? null,
        description: result.description ?? null,
        images: (result.images || []).map((image) => ({
          url: image.url, width: image.width ?? null, height: image.height ?? null, contentType: image.content_type ?? null,
        })),
      };
    }
    await sleep(1500);
  }
}

async function runLeonardo(provider, input, key) {
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  const job = await jsonRequest(provider.endpoint, { method: 'POST', headers, body: JSON.stringify(input) });
  const generationId = job.sdGenerationJob?.generationId;
  if (!generationId) throw new Error('Leonardo response did not include sdGenerationJob.generationId');
  while (true) {
    const response = await jsonRequest(`${provider.pollEndpoint}/${generationId}`, { headers });
    const generation = response.generations_by_pk;
    const status = generation?.status;
    process.stdout.write(`  Leonardo ${status || 'PENDING'}\n`);
    if (status === 'COMPLETE') {
      return {
        requestId: generationId,
        description: null,
        images: (generation.generated_images || []).map((image) => ({
          url: image.url, width: generation.imageWidth ?? input.width ?? null, height: generation.imageHeight ?? input.height ?? null, contentType: null,
        })),
      };
    }
    if (status === 'FAILED') throw new Error(`Leonardo generation failed: ${generationId}`);
    await sleep(2000);
  }
}

function extensionForImage(image) {
  if (image.contentType === 'image/png') return 'png';
  if (image.contentType === 'image/webp') return 'webp';
  if (image.contentType === 'image/jpeg') return 'jpg';
  try {
    const extension = path.extname(new URL(image.url).pathname).replace('.', '').toLowerCase();
    if (['png', 'webp', 'jpg', 'jpeg'].includes(extension)) return extension === 'jpeg' ? 'jpg' : extension;
  } catch {}
  return 'png';
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
  const providerName = chooseProvider(config, args);
  const provider = config.providers[providerName];

  if (args.list) {
    console.log(`Providers: ${Object.keys(config.providers).join(', ')} (default=${config.defaultProvider})`);
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

  const plan = categories.map((category) => ({ ...category, variants: args.variants ?? category.variants ?? 1 }));
  const generationCount = plan.reduce((sum, category) => sum + category.variants, 0);
  if (!Number.isInteger(generationCount) || generationCount < 1) throw new Error('Invalid variants count.');
  if (generationCount > args.maxGenerations) throw new Error(`Planned ${generationCount} generations exceeds --max-generations ${args.maxGenerations}. Raise the cap deliberately.`);
  if (args.all && !args.dryRun && !args.confirm) throw new Error('Non-dry --all requires --confirm to reduce accidental generation spend.');

  const key = process.env[provider.envKey];
  if (!args.dryRun && !key) throw new Error(`${provider.envKey} is required for provider ${providerName}. Keep API keys server-side and never commit them.`);

  const runId = isoRunId();
  const runDir = path.join(args.outputDir, runId);
  const manifest = {
    schemaVersion: 2, runId, createdAt: new Date().toISOString(), provider: providerName,
    endpoint: provider.endpoint, model: provider.modelId || provider.endpoint, modelLabel: provider.modelLabel,
    configVersion: config.version, dryRun: args.dryRun, outputs: [],
  };
  console.log(`Art run ${runId}: ${generationCount} planned generation(s) using ${providerName}/${provider.modelLabel}`);

  let ordinal = 0;
  for (const category of plan) {
    for (let variant = 0; variant < category.variants; variant += 1) {
      ordinal += 1;
      const base = args.seedBase ?? category.seedBase ?? 1000;
      const seed = base + variant;
      const input = buildRequest(config, providerName, category, seed, args);
      console.log(`[${ordinal}/${generationCount}] ${category.id} seed=${seed}`);

      if (args.dryRun) {
        console.log(JSON.stringify({ provider: providerName, endpoint: provider.endpoint, input }, null, 2));
        manifest.outputs.push({ category: category.id, variant, seed, prompt: input.prompt, request: input, status: 'dry-run' });
        continue;
      }

      const result = provider.kind === 'fal-queue' ? await runFal(provider, input, key) : await runLeonardo(provider, input, key);
      if (!result.images.length) throw new Error(`No images returned for ${category.id} seed=${seed}`);
      const saved = [];
      for (let imageIndex = 0; imageIndex < result.images.length; imageIndex += 1) {
        const image = result.images[imageIndex];
        const fileName = `${safeName(category.id)}__seed-${seed}__${imageIndex + 1}.${extensionForImage(image)}`;
        const relative = path.join(category.id, fileName);
        const absolute = path.join(runDir, relative);
        await download(image.url, absolute);
        saved.push({ sourceUrl: image.url, localPath: path.relative(ROOT, absolute), width: image.width, height: image.height, contentType: image.contentType });
      }
      manifest.outputs.push({
        category: category.id, variant, seed, prompt: input.prompt,
        systemPrompt: provider.kind === 'fal-queue' ? input.system_prompt : config.systemPrompt,
        request: input, requestId: result.requestId, modelDescription: result.description, files: saved, status: 'completed',
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
