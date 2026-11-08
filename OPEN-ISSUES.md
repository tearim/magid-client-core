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

## Protocol

### P5. Any non-blocking server error is treated as a freshness mismatch (2026-11-08)
- `MagidClient.run` (`src/client.ts`): an error payload that is neither a stale session, a blocking `E01*` code nor a
  scene mismatch falls through to the freshness-key retry, even without a `freshness-key` in it, and after the second
  failure the player gets "Cannot synchronize with server". Seen live: the server's session limit ("Too many sessions
  (Max sessions for this server: 10)", `E00000`) on the session start leaves no session; `selectStory` then sends
  `set-xml` without one, gets "not supported at this state" twice and reports a sync problem instead of the real cause.
- Fix idea: retry only when the error carries a `freshness-key`; show other errors' `message` as a notice (and keep
  `sessionId` null so the UI can offer to reconnect).
