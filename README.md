# Valeon — Obsidian publishing plugin

Publish, edit, and sync Obsidian posts with the Valeon author dashboard.
Works on desktop and mobile. Reads your vault directly — the dashboard
never sees `valeon-posts/`.

## Install

1. Build a release:
   ```fish
   bun install
   bun run build
   ```
2. Copy `main.js`, `manifest.json`, and `styles.css` into
   `<vault>/.obsidian/plugins/valeon/`.
3. Enable the plugin in Obsidian → Settings → Community plugins.

On mobile: install via Obsidian Sync, or use the Files app to drop the
three files into the plugin folder.

## Setup

1. In the Valeon dashboard, go to **Settings → API Keys** and create a
   new token. Name it for the device (e.g. "iPhone Obsidian"). Copy
   the token — it is only shown once.
2. In Obsidian, open **Settings → Valeon publishing** and paste:
   - **API base URL** — your blog's Convex deployment site URL
     (e.g. `https://acoustic-bird-123.convex.site`).
   - **Dashboard base URL** — used by "Open in dashboard" (e.g.
     `https://dashboard.valeon.io`).
   - **API token** — the value you copied above.
3. Click **Test connection**.

## Commands

| Command | What it does |
|---|---|
| `Valeon: New post` | Prompts for a title, creates `YYYY-MM-DD-{slug}/post.md` from the cached template, opens it. |
| `Valeon: Lint post` | Validates the current note against the cached server schema. |
| `Valeon: Slugify tags (current file)` | Kebab-cases all tag values in frontmatter. |
| `Valeon: Slugify tags (vault)` | Same, vault-wide. |
| `Valeon: Publish` | Lints, uploads new local assets, pushes to the dashboard. First publish creates and publishes; subsequent calls update the draft buffer and republish. |
| `Valeon: Pull post (published)` | Pulls the live published body + frontmatter into the local note. Downloads any new media into `./assets/`. |
| `Valeon: Pull post (draft buffer)` | Same, but prefers the draft buffer. |
| `Valeon: Pull metadata` | Refreshes server-derived fields (`publishedAt`, `readingTime`, `wordCount`, `audioUrl`) in the `valeon:` block. Doesn't touch the body. |
| `Valeon: Sync vault` | Bulk pull for every linked note where the server's `updatedAt` is newer than the local `valeon.remoteUpdatedAt`. Conflict files get auto-backed up. Report goes to `_reports/`. |
| `Valeon: Sync template from server` | Refreshes the schema cache and regenerates `_templates/post.frontmatter.template.md`. |
| `Valeon: Reconcile vault (preview)` | Dry-run for the one-time backfill: matches local notes to remote posts and writes a report. |
| `Valeon: Reconcile vault (apply)` | Writes the `valeon.postId` into every matched note. Idempotent. |
| `Valeon: Open in dashboard` | Opens the linked post's editor URL. |

## First-time backfill (the 141 existing posts)

```text
1. Settings → paste token, set base URLs.
2. Run "Valeon: Sync template from server" once.
3. Run "Valeon: Reconcile vault (preview)".
4. Open the latest file in _reports/ — verify the matches look right.
5. Run "Valeon: Reconcile vault (apply)".
```

All 141 posts now have `valeon.postId` in frontmatter and are
considered "linked". Future edits flow through `Publish`.

## Frontmatter conventions

The plugin manages a `valeon:` block at the end of frontmatter:

```yaml
valeon:
  postId: k7abc...
  publishedAt: 2026-05-17T03:21:00Z
  lastPushedAt: 2026-05-17T04:00:00Z
  lastPushedBodyHash: 9f8e7d...
  remoteUpdatedAt: 2026-05-17T03:21:00Z
  schemaVersion: 1
  media:
    "abc123...": kg2xyz...
```

This block is **stripped before sending to the server**. It is purely
local state. obsidian-linter's `yaml-key-sort` rule accepts unknown
keys at the end of frontmatter, so this co-exists with the existing
ordering convention.

## How assets work

Local paths in your vault stay local. The plugin:

- Reads each referenced image / document on push.
- Computes sha256, dedupes against the local `valeon.media:` map.
- Uploads new assets; writes the sha256 → storageId mapping back.
- Rewrites the **transport copy** of the markdown to `/m/{storageId}`
  — the original file is untouched.

Cross-post relative references (`../another-post/foo.png`) pass
through unchanged.

On pull, the inverse happens: `/m/{storageId}` references get
downloaded into `./assets/` and rewritten back to relative paths.

## Conflict handling

`Pull post` shows a modal when local has unpushed edits AND remote
has newer changes. Three options:

- **Save local as backup & pull**: writes
  `post.local-backup-<ts>.md` next to `post.md`, then pulls.
- **Force pull, discard local**: overwrites without backup.
- **Cancel**: no changes.

`Sync vault` always uses backup-and-pull on conflict.

## Distribution

Tagged releases of this repo (`v*.*.*`) build via
`.github/workflows/release.yml` and attach `main.js`, `manifest.json`,
and `styles.css` to the GitHub release.

There is no plugin-store submission and no BRAT support — install
manually from the releases page.
