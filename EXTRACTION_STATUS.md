# @phantasy/plugin-acp

- Repo URL: https://github.com/phantasy-bot/plugin-acp
- Extraction phase: `source-extracted`
- Source of truth: `standalone-repo`
- Runtime load mode: `git`
- Source owner: `standalone-repo`
- Source payload: `standalone-only`
- Monorepo package status: `removed`
- Sync mode: `standalone-repo`

## Meaning

This repo now owns the real standalone implementation payload for Virtuals Protocol ACP. Core Phantasy should keep only the plugin contract, loader, catalog metadata, and generic proxy routes.

## Next Step

Publish `@phantasy/plugin-acp` after the core `@phantasy/agent` peer package exposes the plugin runtime subpaths required by this plugin.
