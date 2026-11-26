# obsidian-plugin

## External design memory (dev vault)

All design memory for this repo lives in the private GitHub repo **`sayedhfatimi/dev-vault`**: specs, plans, decisions, session logs and the issue tracker. Locally it is cloned at `~/Projects/dev`. In a cloud session, attach it as a second repository next to this one. It is the only durable store; Claude's local memory doesn't reach other devices or cloud sessions.

This repo's folder there is **`projects/valeon-blog/`**.

**Before non-trivial work, read `_meta/claude-protocol.md` in the vault and follow it.** It covers pulling, what to read (including the owner's standing rules in `_shared/working-rules.md`), the mandatory end-of-session update, and committing and pushing the vault. If the vault isn't available, say so before starting work.

**Specs and implementation plans live in the vault, never in this repo.** This overrides any skill's default location (e.g. superpowers' `docs/superpowers/specs/`).

Changes to this repo's own `CLAUDE.md` are committed and pushed normally, with no version bump or release.
