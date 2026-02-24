# Synapse Obsidian Sync Plugin (MVP)

This plugin syncs an Obsidian vault with Synapse using:

- `GET /sync/obsidian` for snapshot
- `GET /sync/obsidian?stream=true` for live updates
- `POST /sync/obsidian` for local change push
- `POST /sync/obsidian/yjs` for Yjs doc-channel sync payloads (state vector + update exchange)

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
- `Bearer token`: vault key token (recommended) or legacy `gateway.auth_token`
- `Remote vault path`: default `obsidian-vault`
- `Collaborator name`: display name for presence/typing
- `Hybrid live collaboration`: enables low-latency typing sync when multiple users are active in the same vault

Then click:

- `Start` for live sync
- or `Run` for one-time sync

## Notes

- By default, `.obsidian/` is excluded.
- Binary files are synced as base64 payloads.
- `Apply remote deletes` is off by default for safety.
- Hybrid mode behavior:
  - One active client: normal queued sync behavior
  - Two or more active clients: plugin switches to fast live typing push mode automatically
- Presence is in-memory on the Synapse server process (best for single-host deployments).
- Yjs channel is now available at `/sync/obsidian/yjs` for CRDT-aware clients.
- Yjs room state hydrates from vault files on first open and persists updates back to vault files.
