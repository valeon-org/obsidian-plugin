# Valeon — Obsidian publishing plugin

Publish and sync posts to the [Valeon](https://valeon.blog) author dashboard
directly from your Obsidian vault. Works on desktop and mobile.

Valeon is an invite-only writing platform. If you're not already an author,
read [How to contribute](https://valeon.blog/how-to-contribute) and submit
the application form linked there — accepted authors receive an invite
email to set up a dashboard account, at which point you can publish either
via the web dashboard or via this plugin from your Obsidian vault.

## Install

Open Obsidian → Settings → **Community plugins** → Browse → search for
"Valeon" → Install → Enable.

## Setup

1. Sign in to the [Valeon author dashboard](https://author.valeon.blog) and
   open **Settings → API Keys**. Create a new token and name it for the
   device (e.g. "iPhone Obsidian"). Copy the token — it is only shown once.
   You can revoke this token at any time from the same page.
2. In Obsidian, open **Settings → Valeon publishing** and paste the value
   into the **API token** field. The API and dashboard URLs are pre-filled.
3. Click **Test connection** to verify.

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
| `Valeon: Reconcile vault (preview)` | Dry-run for backfill: matches local notes to remote posts and writes a report. |
| `Valeon: Reconcile vault (apply)` | Writes the `valeon.postId` into every matched note. Idempotent. |
| `Valeon: Restore vault from server` | Downloads every post you own from the server into a fresh folder structure. |
| `Valeon: Open in dashboard` | Opens the linked post's editor URL in your browser. |

## First-time backfill

If you've been publishing via the web dashboard and your vault already has
post files without a `valeon.postId` in their frontmatter, run a one-time
backfill so the plugin can match them to their remote counterparts:

```text
1. Settings → paste token, click Test connection.
2. Run "Valeon: Sync template from server" once.
3. Run "Valeon: Reconcile vault (preview)".
4. Open the latest file in _reports/ — verify the matches look right.
5. Run "Valeon: Reconcile vault (apply)".
```

All matched posts now have `valeon.postId` in frontmatter and are
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

## Recommended companion: Linter plugin

Install Victor Tao's [Linter](https://github.com/platers/obsidian-linter)
plugin (community plugin id `obsidian-linter`) and enable **Lint on save**.
The rules below align with the frontmatter shape Valeon expects — set
these via Linter's settings tab or paste into
`.obsidian/plugins/obsidian-linter/data.json` under `ruleConfigs`.

**YAML key sort** — keep frontmatter keys in the order Valeon expects:

```text
title
pubDate
updatedDate
excerpt
cover
coverAlt
author
series
featured
tts
podcast
categories
tags
canonical
```

Set *priority keys at start of YAML* = on, *sort order for other keys* =
Ascending Alphabetical. The plugin's `valeon:` block is treated as an
"other key" and stays at the end.

**YAML timestamp** — manage `pubDate` (created) and `updatedDate` (modified):

| Setting | Value |
|---|---|
| date-created-key | `pubDate` |
| date-created-source-of-truth | file system |
| date-modified-key | `updatedDate` |
| date-modified-source-of-truth | file system |
| format | `YYYY-MM-DD[T]HH:mm:ss[Z]` |
| convert-to-utc | on |
| update-on-file-contents-updated | never |

**Other YAML rules to enable** (purely hygiene, no Valeon-specific config):
*add-blank-line-after-yaml*, *dedupe-yaml-array-values*,
*escape-yaml-special-characters*, *format-tags-in-yaml*.

**Folders to ignore** — add `_templates` so the linter doesn't mangle
the post template that `Valeon: Sync template from server` writes.

The remaining list / heading / spacing rules are general markdown
hygiene — pick whatever you prefer; they don't conflict with Valeon's
requirements.

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

## Development

The production API and dashboard URLs are baked into the build at compile
time. Override them for local development against a non-production Valeon
backend:

```fish
set -x VALEON_API_BASE_URL "https://your-dev.convex.site"
set -x VALEON_DASHBOARD_BASE_URL "https://author.dev.valeon.blog"
bun install
bun run dev
```

The text fields in the plugin's settings tab remain user-editable, so you
can also override per-vault at runtime without rebuilding.

Tagged releases (`v*.*.*`) build via `.github/workflows/release.yml` and
attach `main.js`, `manifest.json`, and `styles.css` to the GitHub release.
