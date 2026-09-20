# Asset Provenance v1

Every production visual/audio asset should have enough provenance to answer: where did it come from, can we use it, how was it transformed, and which game version depends on it?

## Required record

For each production asset or atlas family record:
- stable asset ID/name;
- source type: generated / original / commissioned / third-party;
- source URL or generation tool/model when applicable;
- license/usage terms for third-party assets;
- generation prompt/reference ID or source-file reference when applicable;
- author/editor and date;
- transformations: cleanup, crop, recolour, relight, upscale, atlas packing, compression;
- target scale/anchor/facing convention;
- current file paths and version/commit introduced.

## Rules

- Unknown-license assets remain prototype-only and do not ship.
- Generated assets keep prompt/reference metadata so matching variants can be reproduced.
- Do not embed private source material or personal data in provenance records.
- Replacing an asset keeps the old record linked as superseded rather than silently losing history.

A lightweight JSON or Markdown manifest is sufficient; consistency matters more than format.
