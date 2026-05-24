# Valeon

Publish and sync posts to the [Valeon](https://valeon.blog) author dashboard
from your vault. Works on desktop and mobile.

Valeon is an invite-only writing platform. If you're not already an author,
read [How to contribute](https://valeon.blog/how-to-contribute) and submit
the application form linked there — accepted authors receive an invite
email to set up a dashboard account, at which point you can publish either
via the web dashboard or with this plugin.

## Install

Open Obsidian → Settings → **Community plugins** → Browse → search for
"Valeon" → Install → Enable.

## Setup

1. Sign in to the [Valeon author dashboard](https://author.valeon.blog) and
   open **Settings → API Keys**. Create a new token and name it for the
   device (e.g. "iPhone Obsidian"). Copy the token — it is only shown once.
   You can revoke this token at any time from the same page.
2. In Obsidian, open **Settings → Valeon publishing** and paste the value
   into the **API token** field. That's the only setting authors configure —
   the plugin always talks to the production Valeon backend.
3. Click **Test connection** to verify.
4. Run **`Valeon: Sync template from server`** once. This downloads the
   current schema and writes `_templates/post.frontmatter.template.md` —
   the cached template that `Valeon: New post` uses to populate the
   frontmatter of new posts. Without this step, `Valeon: New post` will
   prompt you to run it; doing it up front avoids the interruption. Re-run
   the command any time the server's schema changes.

## Folder structure

Every post lives in its own dated folder at the top level of the vault:

```text
2026-05-21-my-first-post/
├── post.md
└── assets/
    ├── cover.png
    └── diagram.svg
```

The plugin only recognises this layout — `YYYY-MM-DD-{slug}/post.md`. Files
that aren't named exactly `post.md`, or that live outside a dated folder, are
ignored by sync, publish, lint, and reconcile.

- **Create posts** with `Valeon: New post`. It prompts for a title, derives
  the slug, creates the dated folder (`YYYY-MM-DD-{slug}/`), writes a fresh
  `post.md` pre-populated with the frontmatter scaffold from the cached
  schema template, and opens it for editing. You don't need to create the
  folder or copy a template by hand — this command does both.
- **Slug** is derived from the title and is part of the folder name — don't
  rename the folder after publishing; the plugin uses it to match local
  notes to their remote post.
- **Place assets** (images, attachments, supporting documents) inside the
  post's folder. The convention is a `./assets/` subfolder, but any path
  inside the post folder works. See [Inline images & assets](#inline-images--assets)
  below.

## Commands

| Command | What it does |
|---|---|
| `Valeon: New post` | Prompts for a title, creates `YYYY-MM-DD-{slug}/post.md` from the cached template, opens it. |
| `Valeon: Lint post` | Validates the current note against the cached server schema. |
| `Valeon: Slugify tags (current file)` | Kebab-cases all tag values in frontmatter. |
| `Valeon: Slugify tags (vault)` | Same, vault-wide. |
| `Valeon: Generate cover with AI` | Generates a styled cover for the current post using the Valeon image model. Pick a named style (and variant/hue where applicable); saves the result as `./cover.png` and sets the `cover` frontmatter. Write your own `coverAlt`. Publish uploads it like any other asset. |
| `Valeon: Suggest excerpt with AI` | Generates an excerpt from the post body and writes it into the `excerpt` frontmatter for you to review and edit. |
| `Valeon: Suggest cover alt text with AI` | Describes the post's cover image (a vision pass) and writes the result into `coverAlt` for you to review and edit. Requires `cover` to be set. |
| `Valeon: Publish` | Lints, uploads new local assets, pushes to the dashboard. First publish creates and publishes; subsequent calls update the draft buffer and republish. |
| `Valeon: Pull post (published)` | Pulls the live published body + frontmatter into the local note. Downloads any new media into `./assets/`. |
| `Valeon: Pull post (draft buffer)` | Same, but prefers the draft buffer. |
| `Valeon: Pull metadata` | Refreshes server-derived fields (`publishedAt`, `readingTime`, `wordCount`, `audioUrl`) in the `valeon:` block. Doesn't touch the body. |
| `Valeon: Pull metadata (vault)` | Same as above, applied to every linked note in the vault. |
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

The Valeon plugin ships its own `Valeon: Lint post` command, but it does a
different job than Victor Tao's Linter plugin — the two are complementary,
not redundant:

- **`Valeon: Lint post` validates** your frontmatter against the live server
  schema — required keys, allowed category enums, slug pattern, excerpt
  length, etc. It does not modify the file; it surfaces errors so publish
  will succeed.
- **Victor Tao's Linter formats** YAML and body — sorts keys, normalises
  timestamps, escapes special characters, trims whitespace, enforces
  heading and list style. It does not check whether your post is valid for
  Valeon; that's the job of the validator above.

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

## Inline images & assets

Place every image, attachment, or other supporting file **inside the post's
own folder** — files outside the folder are not uploaded. The convention is
a `./assets/` subfolder, but any path inside the post folder works:

```markdown
![architecture diagram](./assets/diagram.svg)
![[assets/photo.jpg]]
```

Both standard markdown and Obsidian wiki-link syntax are supported; the
plugin normalises wiki-links to standard markdown during push.

**Cover image:** declare it in frontmatter, pointing at a path inside the
post folder. The cover is validated by lint before publish (which also warns
when `cover` is set but `coverAlt` is missing):

```yaml
cover: ./assets/cover.png
coverAlt: A clay model of the new logo on a wooden desk.
```

Or generate one: run **`Valeon: Generate cover with AI`** on the post, pick a
style, and the plugin saves the image as `./cover.png` in the post folder and
sets the `cover` frontmatter (the subject defaults to the post's excerpt or
title). Generation doesn't fill in `coverAlt` — write your own, or run
**`Valeon: Suggest cover alt text with AI`** for an editable suggestion drawn
from a vision pass over the rendered image. It then publishes like any other
cover.

**What the plugin does on publish:**

- Reads each referenced asset, computes sha256, dedupes against the local
  `valeon.media:` map.
- Uploads new assets; writes the sha256 → storageId mapping back into
  frontmatter.
- Rewrites the **transport copy** of the markdown to `/m/{storageId}` — the
  original file in your vault is untouched.

**Supported formats:** any MIME type the server schema allows
(`schema.media.allowedMimeTypes`). Lint reports anything unsupported before
the upload attempt — run `Valeon: Lint post` if you want to check ahead of
time.

**On pull:** `/m/{storageId}` references get downloaded into `./assets/`
and rewritten back to relative paths automatically.

### Linking between notes

**Assets vs cross-post links.** Links inside the same post folder are
treated as assets and uploaded; everything else falls under cross-post
behaviour:

- **Links inside the same post folder** (`./assets/x.png`,
  `./supplementary.md`) → uploaded as assets, rewritten to
  `/m/{storageId}` in the transport copy.
- **Cross-post links** (see below) → translated to a stable
  `valeon:post:{convexId}` URI on push so the link survives folder
  renames and slug changes.
- **External URLs** (`https://example.com/...`) → untouched.

Wiki-links (`[[note]]`, `![[asset]]`) work the same way — they're
converted to standard markdown during push and follow the same
inside/outside-folder rule.

### Cross-post references

You can link from one Valeon post to another. The plugin handles
translation to a stable identifier on push, and back to something
human-readable on pull, so you keep writing normal markdown and the
link survives folder renames, slug changes, and editing the same post
from the web dashboard.

**To write a cross-post link, use one of these two forms:**

```markdown
For my own posts, point at the other post.md file:
[my earlier piece](../2026-04-12-warmup/post.md)

For another author's post (or your own via canonical URL),
paste the blog URL straight from the address bar:
[Sarah's essay](https://valeon.blog/2026/04/15/sarahs-essay)
```

Obsidian's autocomplete will offer the dated folder name as you type
`../`, which keeps the first form fast. The canonical-URL form is
the only way to reference posts not in your vault.

Both forms support `#anchor` fragments and `?query` strings, preserved
end-to-end:

```markdown
[the intro section](../2026-04-12-warmup/post.md#intro)
[via card](https://valeon.blog/2026/04/15/sarahs-essay?ref=card)
```

**What happens on publish.** `Valeon: Publish` translates either form
into a stable `valeon:post:{id}` URI before sending the body to
Convex. Your local `post.md` file is **not modified** — only the
transport copy that lands in the database. The blog's render pipeline
resolves the URI to `/YYYY/MM/DD/{slug}` at render time, so the
rendered link always points at the target's current canonical URL even
if its slug or publication date changes later.

**What happens on pull.** `Valeon: Pull post` and `Valeon: Sync vault`
reverse the translation, writing the most useful local form back into
your `post.md`:

| Referenced post state | What lands in your local file |
|---|---|
| Owned by you, already in this vault | `../folder/post.md` — clickable inside Obsidian |
| Foreign, already published | `https://valeon.blog/YYYY/MM/DD/slug` — clickable in the browser via Obsidian's link handler |
| Foreign, still draft (or archived) | `valeon:post:{id}` left verbatim — not clickable in Obsidian, but rewrites itself to a real URL on the next pull once the target publishes |

You'll occasionally see the third row if you reference a friend's
draft. It's harmless; the URI round-trips on the next publish, and the
blog renders a "broken link" 404 in the meantime until the target ships.

**Lint catches problems before publish.** `Valeon: Lint post` (run
implicitly by `Valeon: Publish`) flags these cases as errors and
blocks the push:

- **Folder-path form points at a file that doesn't exist in your vault.**
  Either the path is wrong, or the target hasn't been pulled yet.
- **Folder-path form points at a file with no `valeon.postId` in
  frontmatter.** The target exists locally but hasn't been linked to
  Valeon — publish it first (or run `Valeon: Reconcile vault`).
- **Canonical URL doesn't match any published post.** The slug in the
  URL doesn't exist on the server, or the post is still a draft. (Draft
  slugs aren't reachable until publication; the URL form only works
  for published posts.)

**Editing from the web dashboard.** The author dashboard's editor
supports the same cross-post mechanism — `/post` slash command, a
search-posts mode in the Cmd+K link dialog, and paste-detection of
canonical blog URLs. Posts edited in the dashboard produce the same
`valeon:post:{id}` wire form, so if you pull one of those posts into
Obsidian afterwards you'll see the local equivalents (folder paths or
canonical URLs) in the file.

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

Tagged releases (semver, no `v` prefix per the Obsidian community-plugin
convention) build via `.github/workflows/release.yml`, attach `main.js`,
`manifest.json`, and `styles.css` to the GitHub release, and sign the
artifacts via `actions/attest-build-provenance`.
