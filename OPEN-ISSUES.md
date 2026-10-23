# Open issues

Problems found by AI agents while working in this repo, left **unfixed on purpose** for the owner to resolve.
Agents add new findings here instead of fixing code they weren't asked to touch (see `CLAUDE.md` → "Working with the owner").
Delete an entry once it's resolved. Each entry: what's wrong, where, why it matters, and a suggested fix.

## Parsing

### P3. Text before the first `DCSTP_` marker is cut at its first `@` (2026-10-23)
- `parseTextSegments` (`src/textTimeline.ts`) treats every part of `raw.split('DCSTP_')` as `ms@text`, also the part
  *before* the first marker. `resolveCleanText('mail a@b DCSTP_5@c')` gives `"b c"`: `mail a@` is lost.
- Fix idea: only parts that followed a `DCSTP_` carry a delay (skip the `@` handling for index 0 unless the text starts
  with the marker).

## Release

### L1. License and scope name undecided (2026-10-23)
- The package is meant to be public, but `package.json` has no `license` and is still `"private": true`. npm warns
  without a license, and without one nobody may legally reuse the code.
- The scope `@magid` couldn't be checked without an npm login (`npm org ls magid` or the npm website after login);
  fallback `@magiden`.
