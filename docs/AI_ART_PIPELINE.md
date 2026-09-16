# AI Art Pipeline v1

This pipeline creates **visual-development drafts first** and only promotes selected images into tracked game assets after a human review. It is deliberately separated from the runtime renderer.

## Why

The game needs a consistent semi-realistic, painterly, high-angle 2D/2.5D Napoleonic style without letting generated imagery silently replace live assets. The pipeline therefore keeps generation reproducible (prompt, model, seed, run manifest) and follows `docs/asset-provenance-v1.md` when an image is promoted.

## Model

The v1 config uses `fal-ai/nano-banana-pro` through fal's queue API. The endpoint and exact request defaults live in `art-pipeline/prompts.json`; change them together if the model is deliberately replaced. Do not assume parameters are portable between models.

The API key is read only from `FAL_KEY` in the shell. Never put a key in Git, browser code, `prompts.json`, or a GitHub Pages build.

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

The common style prompt is intentionally stronger than any category prompt so terrain, units and effects converge on the same camera, lighting and readability rules.

## Safe workflow

1. Inspect what would be sent without spending anything:

   ```bash
   npm run art:list
   npm run art:dry -- --category style-keyframe
   ```

2. Export the fal key locally:

   ```bash
   export FAL_KEY="..."
   ```

3. Generate a small batch first:

   ```bash
   npm run art:generate -- --category style-keyframe --variants 2
   ```

   Drafts go to `art/generated/<timestamp>/...`. That directory is gitignored. Every run writes a `manifest.json` containing model, prompt, seed, request metadata and original result URLs.

4. Generate several categories only after reviewing a small batch. The script enforces a generation cap. A full run requires an explicit confirmation and a deliberately raised cap:

   ```bash
   npm run art:generate -- --all --confirm --max-generations 18
   ```

5. Review the generated drafts manually for tactical readability, historical plausibility, matching camera/perspective, clean silhouettes, coherent lighting and suitability for the current renderer.

6. Promote only an approved image:

   ```bash
   npm run art:promote -- \
     --manifest art/generated/<run>/manifest.json \
     --file art/generated/<run>/french-line-infantry/<file>.png \
     --asset-id french-line-infantry-v1
   ```

   Promotion copies the image under `assets/generated/...` and updates `assets/generated/provenance.json` with its model, prompt, seed, source URL and project version. Before a production merge, add any actual cleanup/crop/recolour/atlas work and record the final scale/anchor/facing convention.

## Guardrails

- Generation does not modify runtime code or overwrite current assets.
- `--all` requires `--confirm` and is still bounded by `--max-generations`.
- Draft generations are not committed by default.
- A generated image is not automatically a production-ready sprite or texture.
- Production assets require in-game visual validation and the normal regression/Golden Battle checks.
- Keep historical reference material and third-party imagery separate from generated outputs; do not feed private/copyright-sensitive source material into this pipeline without appropriate rights.

## Suggested production loop

`North Star / screenshot -> choose weak visual layer -> generate 2-4 controlled variants -> human shortlist -> promote -> crop/atlas/integrate -> Golden Battle screenshot comparison -> keep or revert`

This keeps AI generation as an art-production accelerator rather than a second source of gameplay/rendering authority.
