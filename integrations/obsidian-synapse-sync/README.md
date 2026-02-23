# Synapse Obsidian Sync Plugin (MVP)

This plugin syncs an Obsidian vault with Synapse using:

- `GET /sync/obsidian` for snapshot
- `GET /sync/obsidian?stream=true` for live updates
- `POST /sync/obsidian` for local change push

It does not use CouchDB and does not require Obsidian LiveSync.

## Install in Obsidian

1. In your vault, create folder:
   - `.obsidian/plugins/synapse-obsidian-sync`
2. Copy these files into that folder:
   - `manifest.json`
   - `main.js`
   - `versions.json` (optional but recommended)
3. Open Obsidian:
   - `Settings -> Community plugins`
   - Disable Safe mode if needed
   - Enable `Synapse Obsidian Sync`

## Configure

Open plugin settings and fill:

- `Synapse URL`: e.g. `https://synapse.example.com`
- `Gateway ID`: your Synapse gateway id
- `Bearer token`: value of `gateway.auth_token`
- `Remote vault path`: default `obsidian-vault`

Then click:

- `Start` for live sync
- or `Run` for one-time sync

## Notes

- By default, `.obsidian/` is excluded.
- Binary files are synced as base64 payloads.
- `Apply remote deletes` is off by default for safety.
- This is an MVP sync connector; add conflict strategy and stronger reconciliation rules before large multi-device rollouts.
