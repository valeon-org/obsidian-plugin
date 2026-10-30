# obsidian-plugin

## External design memory (dev vault)

Cross-device architectural memory lives in the **dev** Obsidian vault (synced via Obsidian Sync, **not git**; typically `~/Projects/dev`). Claude Code's own memory is local per-device and does not sync — the vault is what carries reasoning between machines and between sessions.

**Before non-trivial work — READ it.** Start at `_meta/HOME.md`, then `projects/valeon/` (the project home, `issues/open.md`, and any decision or spec the task touches) and `_shared/`.

**At the END of every session — UPDATE it. This is not optional.** A session that changed code and left the vault untouched has produced work whose reasoning the next session cannot see, and a tracker that drifts silently until someone re-derives it from the diff. Update whichever surfaces the session actually touched:

| Surface | Update when |
|---|---|
| `projects/valeon/sessions/YYYY-MM-DD-<slug>.md` | Any session worth narrating — what was found, what it cost, and what was deliberately NOT done |
| `projects/valeon/issues/open.md` | Items closed, opened, or whose premise changed. Shipped work moves to `resolved.md`; work that cannot be started moves to `deferred.md` |
| `projects/valeon/decisions/<topic>.md` | A durable choice was made that is **not derivable from the code** |
| `projects/valeon/valeon.md` | Versions were released, or the "Current status" paragraph is now stale |
| `projects/valeon/specs/` and `plans/` | A spec was implemented or a plan executed — add the `> [!check] EXECUTED` callout recording deltas vs. what was written |

**Specs and implementation plans live in the vault, never in this repo.** Write them to `projects/valeon/specs/YYYY-MM-DD-<slug>.md` and `projects/valeon/plans/YYYY-MM-DD-<slug>.md` — this overrides any skill's default location (e.g. superpowers' `docs/superpowers/specs/`). Nothing design-related is committed here.

Read `_meta/conventions.md` before writing. The rules that catch people out: one fact has **one canonical home** (link, don't restate), every entry must be self-contained because a future session was not present for this one, and prose is **one line per paragraph** — never hard-wrapped.

Nothing is committed in the vault itself; Obsidian Sync carries it. This repo's own `CLAUDE.md` changes are committed and pushed normally, with no version bump or release.
