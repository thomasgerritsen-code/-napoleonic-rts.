# AI Art Pipeline v2

This pipeline creates **visual-development drafts first** and only promotes selected images into tracked game assets after human review. It is deliberately separated from the runtime renderer.

## Why

The game needs a consistent semi-realistic, painterly, high-angle 2D/2.5D Napoleonic style without letting generated imagery silently replace live assets. The pipeline keeps generation traceable through prompt, provider, model, seed and a run manifest, and follows `docs/asset-provenance-v1.md` when an image is promoted.

## Providers

The pipeline supports two providers:

- `leonardo` — default provider. Uses Leonardo.ai REST v1 image generation with a fixed model ID, private generations and fixed seeds. Set `LEONARDO_API_KEY` in the shell.
- `fal` — fallback/alternative provider using `fal-ai/nano-banana-pro`. Set `FAL_KEY` in the shell.

Provider selection order is: explicit `--provider`, then `ART_PROVIDER`, then an available Leonardo key, then an available fal key, then the configured default. API keys are never stored in Git or browser code.

Leonardo API credits are separate from Leonardo web-app subscriptions. The current model/provider details are centralized in `art-pipeline/prompts.json`; do not assume request parameters are portable between providers.

## Prompt library

`art-pipeline/prompts.json` contains one shared style instruction and separate categories:

- `style-keyframe`
- `terrain-grassland`
- `terrain-road`
- `village`
- `french-line-infantry`
- `british-line-infantry`
- `cavalry`
- `artillery`
- `fx-black-powder`

The common style instruction keeps camera, lighting, palette and tactical readability consistent across categories.

## Safe workflow

1. Inspect categories/providers and requests without spending anything:

   ```bash
   npm run art:list
   npm run art:dry -- --provider leonardo --category style-keyframe
   npm run art:dry -- --provider fal --category style-keyframe
   ```

2. Export exactly the provider key you want to use:

   ```bash
   export LEONARDO_API_KEY="..."
   # or
   export FAL_KEY="..."
   ```

3. Generate a small Leonardo batch first:

   ```bash
   npm run art:generate -- --provider leonardo --category style-keyframe --variants 2
   ```

   Or use fal explicitly:

   ```bash
   npm run art:generate -- --provider fal --category style-keyframe --variants 2
   ```

   Drafts go to `art/generated/<timestamp>/...`. That directory is gitignored. Every run writes a `manifest.json` containing provider, model, prompt, seed, request metadata and original result URLs.

4. Generate several categories only after reviewing a small batch. The script enforces a generation cap. A full run requires explicit confirmation and a deliberately raised cap:

   ```bash
   npm run art:generate -- --provider leonardo --all --confirm --max-generations 18
   ```

5. Review drafts manually for tactical readability, historical plausibility, matching camera/perspective, clean silhouettes, coherent lighting and suitability for the current renderer.

6. Promote only an approved image:

   ```bash
   npm run art:promote -- \
     --manifest art/generated/<run>/manifest.json \
     --file art/generated/<run>/french-line-infantry/<file>.png \
     --asset-id french-line-infantry-v1
   ```

   Promotion copies the image under `assets/generated/...` and updates `assets/generated/provenance.json` with provider, model, prompt, seed, source URL and project version. Before a production merge, record any cleanup/crop/recolour/atlas work and the final scale/anchor/facing convention.

## Provider notes

### Leonardo

The v2 pipeline uses Leonardo's v1 image-generation endpoint because it supports a fixed seed for consistency. The default model ID is Leonardo Lightning XL and the default request is private, 1536×864, Alchemy enabled, `ILLUSTRATION` preset style. Override provider selection with `--provider leonardo`.

`--aspect` can override the default composition for Leonardo using supported presets such as `16:9`, `4:3`, `3:2` or `1:1`. `--resolution` is intentionally fal-only because the providers expose resolution differently.

### fal

fal keeps the previous 2K, 16:9, PNG defaults. The generator uses the queue API and continues to preserve fixed seeds and the same prompt categories.

## Guardrails

- Generation does not modify runtime code or overwrite current assets.
- `--all` requires `--confirm` and is still bounded by `--max-generations`.
- Draft generations are not committed by default.
- A generated image is not automatically a production-ready sprite or texture.
- Production assets require in-game visual validation and normal regression/Golden Battle checks.
- Provider/model/seed/source URL are recorded in provenance when an image is promoted.
- Keep historical reference material and third-party imagery separate from generated outputs; do not feed private or rights-sensitive source material into providers without appropriate permission.

## Suggested production loop

`North Star / screenshot -> choose weak visual layer -> generate 2-4 controlled variants -> human shortlist -> promote -> crop/atlas/integrate -> Golden Battle screenshot comparison -> keep or revert`

This keeps AI generation as an art-production accelerator rather than a second source of gameplay/rendering authority.
