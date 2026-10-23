# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before anything else: staleness check

Run this at the start of **every** session, before the first task:

```bash
bash .claude/scripts/staleness-check.sh          # doc drift + tests / type-check / lint / build baseline
bash .claude/scripts/staleness-check.sh --quick  # doc drift only
```

It lists the commits since this file last changed and every path, document or identifier named here that no longer
exists, and records the current baseline. Then:
1. Compare its output with `OPEN-ISSUES.md`.
2. Tell the owner in a few lines what changed or broke since last time.
3. Fix stale statements in this file (doc edits only) before starting the actual task. Nothing in it may stay wrong.

**The code is the source of truth.** This file, `README.md` and old commit messages may lag.

## Working with the owner

- **Report problems; don't fix them unasked.** The owner likes to fix some things personally. When you find a bug, smell
  or doc/code mismatch outside the task, add it to `OPEN-ISSUES.md` (where, why it matters, suggested fix) and mention it
  in your reply. Remove entries once resolved. Fix only what the task covers.
- **Assess requests before implementing.** If a requested change looks like a bad idea, say why and don't implement it
  unless the owner insists after hearing the reasons.
- **Tests specify correct behavior; they never document the current state.**
  - Test names (`describe`/`it`), comments and assertion messages never say whether the test currently passes or fails:
    no "RED", "GREEN", "BUG", "known bug", "currently fails", "should turn red when fixed".
  - Assert what the code **should** do. Never write a test that passes *because* a bug exists, and never branch inside a
    test on the state under test so that it passes either way.
  - In code the owner writes (you're assisting): a failing test is the deliverable. It marks a bug for the owner to
    debug. Don't "fix" the code or weaken the test to make it pass; report it and log it in `OPEN-ISSUES.md`.
  - In code you write yourself: make the tests pass, still with neutral names.
- **Don't add lint noise.** New code must not add `eslint` / `tsc` problems; the baseline is in the staleness-check output.
- **Most of this code was written by Claude; the owner edits parts of it.** Treat the owner's recent changes (see
  `git log`) as intentional, even where they diverge from patterns elsewhere.

## Related repositories

- **Server** (`C:\developer\com.zarterstein`, Java, private): the source of truth for the wire protocol. Command handling
  is in `story-server/agnostic` (`MagidServerCoreActions`, `MagidServerRouter`), the MagidML tag reference is
  `MAGID-XML-DSL.md`, stories (real `magid:///…` URLs, CSS classes, `implied-classes-of:` vars) are in `content/`. Read it
  when a protocol question comes up; don't change it from here.
- **Clients** built on this package: `magid-client-rct` (React, the reference consumer; `C:\developer\magid-client-rct`),
  later `-ang` (Angular) and `-pure` (plain pages). Its history before the extraction (2026-10-23) lives there too.
- The JavaFX client (`magid-jfx-client`) does **not** use this package and is maintained separately.

## What this is

`@magiden/client-core` (npm scope `magiden` = Magid engine; `@magid` wasn't available): the framework-free client for the Magid server, a declarative storytelling engine. The server
exposes `GET {baseUrl}?cmd=…` and returns one JSON payload per command describing what to render. This package does
everything a renderer shouldn't have to: transport, session and recovery protocol, response parsing, config, and
presentation semantics (typing, implied classes, inline CSS, sanitized HTML). Renderers (React, Angular, a plain `<div>`)
only draw what `MagidClient` hands them.

**Hard rules**
- **No DOM, no framework.** `tsconfig.json` has no `DOM` lib and tests run in Node, so a stray `window`/`document` fails
  the type-check or the tests. Web globals the core needs (`URL`, `URLSearchParams`, `console`) are declared minimally in
  `src/runtime.d.ts`; anything added there must exist in browsers, Node, Deno and Bun.
- **One library.** DOM helpers (stylesheets, fullscreen, audio) are planned as a `./dom` subpath export of this same
  package, not a second package.
- **Public API** = whatever `src/index.ts` re-exports. Treat it as such: renames are breaking changes.
- **Relative imports name the `.ts` file** (`from './anchors.ts'`); the build rewrites them to `.js`
  (`rewriteRelativeImportExtensions`), which Node's ESM loader needs.
- **Zero runtime dependencies.** Keep it that way unless the owner agrees otherwise.

## Commands

```powershell
npm install          # dev tools only; also runs `prepare` → build
npm run build        # tsc -p tsconfig.build.json → dist/ (ESM + .d.ts + maps; tests excluded)
npm test             # vitest run (Node environment)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm pack --dry-run   # what would be published (dist + src without tests)
```

Run a single test file: `npx vitest run src/html.test.ts`; by name: `npx vitest run -t "parses a menu response"`.

`npm install` from scratch crashed in npm's resolver (`Cannot read properties of null (reading 'edgesOut')`, npm 10 and
11) during the extraction; the committed `package-lock.json` avoids it (`npm ci` / `npm install` with the lockfile work).
Don't delete the lockfile to "fix" dependency problems.

## Releasing

Public on npm as `@magiden/client-core` (Apache-2.0, `LICENSE`); source on GitHub under the owner's account
(`tearim/magid-client-core`). Publishing is the owner's step (`npm publish` with the account that owns `magiden`).
- Versions follow semver; a wire-protocol change that needs a newer server, or any change to an export, is a major
  (or, before 1.0, a minor) bump. Tag releases `vX.Y.Z`. Note changes in the commit messages; there's no changelog yet.
- `prepublishOnly` runs type-check, lint and tests; `prepare` builds `dist/`, so a git dependency
  (`github:tearim/magid-client-core#vX.Y.Z`) builds on install.

## Architecture (`src/`)

### Transport (`transport.ts`)

`sendCommand(config, cmd, extra)` → `GET {baseUrl}?cmd=…&client-type=…` with `Authorization: Bearer <session-id>`.
`fetch` is injectable (`FetchLike`), so tests and non-browser runtimes supply their own. The renderer announces itself
through `clientType` (`react`, `pure`, `angular`, …), which also selects `css-files-{clientType}`.

### Response parsing is key-driven, not type-driven (`elementFactory.ts`)

One response object can carry several recognized keys at once (`narration` and `menu`), and some element types have
aliases (`menu`/`menu-name`, `text`/`narration`, `command`/`command-name`/`command-text`, …). `ELEMENT_PARSERS` maps every
known JSON key to a parser producing a `ParsedElement`; it is the *one* place that knows element types. Add new keys or
aliases only there, then extend the `ParsedElement` union and `protocol.ts`. `responses` arrays recurse through
`parseResponse` and collapse into one `{ type: 'responses' }` node.

`resolveAnchors` / `resolveInObject` (`anchors.ts`) rewrite every `magid://` string to the active `baseUrl` at parse
time, recursively. It is a plain prefix replacement, exactly like the server's `XmlBundleLoader`, so the valid form is
`magid:///path` (the third slash starts the path).

### Protocol engine: `MagidClient` (`client.ts`)

`getState()` returns an immutable snapshot (a new object per change: works with `useSyncExternalStore`, zustand,
signals); `subscribe` and `on('notice' | 'viewport')` observe it. Renderers never re-implement the protocol:
- **Config elements** (`css-files` / `css-files-{clientType}` + arbitrary vars) are applied immediately and stripped from
  what gets rendered. Stylesheet URLs become `state.stylesheets` (loading them is the renderer's job); vars go to
  `state.envVars`; `view-port` emits `viewport`; `menu-position` is only warned about (the JFX reference client ignores
  it too — don't implement it without checking that client).
- **Session elements** carry `session-id`/`file-request-token`/available XMLs/server metadata; applied in a pre-pass so
  the token is there before same-batch CSS loads. Session id and token persist through the injected `KeyValueStorage`
  (`STORAGE_KEYS`; in memory by default).
- **Detached elements** (`type: 'detached'`) never render standalone: they're attached to every `menu` of the same batch
  (`detached-elements`: `prepend`, `append`, or `by-anchor` via a `text-anchor` in the menu description). A new menu
  resets `userInputs` to the batch's `input-value`s.
- **Scene sync / freshness**: `currentScene` and the `freshness-key` var go out with every command. On a
  `status: 'error'` payload the client tells apart a stale session (dropped, a fresh one opened, the action not
  retried), a blocking `E01*` error (`connectivityBlockedError`), a scene mismatch (action dismissed, current menu
  re-fetched, `notice`) and a freshness-key mismatch (same command retried once with the corrected key).
- **Story loading** (`selectStory` = `set-xml`, `resetStory` = `reload-xml`) first drops stylesheets, vars, scene and
  inputs. Commands run **one at a time** (queue).
- **Server settings in config** (not story vars; kept across story loads; cleared on session end / server change):
  - `allowed-commands` (`group:action,action;group:action`, parsed by `capabilities.ts`) → `state.allowedCommands`.
    `can(command)` tells the UI what to offer, and the client refuses disallowed commands locally (no request). Only the
    server actions in `SERVER_ACTIONS` are gated; story commands always pass. Not announced yet = everything allowed.
    The operator's `disabledCommands` (`'reload-xml'` or `'xml:reload-xml'`) always win.
  - `allowed-tags` / `allowed-tag-attributes` (comma-separated) → `state.htmlPolicy`; see "HTML in display text".

### HTML in display text (`html.ts`)

Narration and menu descriptions are parsed once by a small state machine into a sanitized tree (`HtmlNode[]`); renderers
build real elements from it, never `innerHTML`. Without `allowed-tags` (`htmlPolicy` null) nothing is parsed: plain text.
Otherwise:
- **Prose, not a tag** (text, no warning): anything not well-formed (`a < b`, `a<b!`, a trailing `<b`), and a would-be
  tag with a bare word that isn't an allowed attribute (`a<b and c>d`).
- **Tag not in `allowed-tags`**: removed, content kept, console warning.
- **Attribute with a value not in `allowed-tag-attributes`** (`id="x"`): removed from the tag, console warning. `on*` and
  `javascript:`/`vbscript:` URLs are always removed.
- A literal tag that would otherwise parse is written `&lt;b>` (in story XML: `&amp;lt;b>`).
- **Transformed tags** (`TAG_PROCESSORS`, the one place for them): `<title>` → `<span class="title">` (console log),
  since a body `<title>` is invisible and React 19 hoists it into `<head>`. `<img>` from the Magid server (`src` starting
  with `baseUrl`, i.e. a resolved `magid:///…`) gets `file-request-token` (`withFileRequestToken`), since an image request
  can't carry the Bearer header; external images are left alone so the token never leaves the server.

Reports go through an `HtmlReport` (removals `warn`, transformations `log`). Renderers call
`prepareDisplayText(raw, htmlPolicy, { baseUrl, fileRequestToken })` and re-parse when those change. It hands the
typewriter only the visible text (with `DCSTP_` markers); `truncateHtml` cuts the tree by visible characters, so tags are
never typed out: an element appears whole with its first character.

### Presentation semantics

- **Typewriter timeline** (`textTimeline.ts`): `DCSTP_{ms}@{text}` segments → cumulative-offset segments
  (`parseTextSegments`, `resolveCleanText`, `hasTimeLineStops`).
- **Typing styles** (`typingConfig.ts`, `getConsequentalTypingConfig`): classes `type-by-letter-{ms|slow|normal|fast|rapid}`
  / `type-by-word-{…}` (named speeds: slow 30, normal 20, fast 10, rapid 5 ms) and `animation-resets-{ms}` (plural).
- **Implied classes** (`impliedClasses.ts`, `applyImpliedClasses`): vars `implied-classes-of: pattern, …` add classes to
  elements whose **whole** class string matches: `x` equals, `x*` starts with, `*x` ends with, `*x*` contains. No
  chaining, no duplicates, explicit classes first. Renderers derive them (never mutate the data) and re-derive when
  `envVars` change.
- **Inline CSS** (`magidCss.ts`, `parseMagidCss`): per-element `css` strings → camelCased `MagidStyle` (a React `style`
  prop, or `Object.assign(el.style, …)`). Bare `left`/`top`/… numbers get `px` and imply `position: absolute`.
  `-mg-abs-x`/`-mg-abs-y` act like `left`/`top` and win over them (as in the JFX client). Window-level `-mg-*`
  (`-mg-window-*`, `-mg-resizable`, `-mg-screen`) and JavaFX-only `-fx-*` are dropped.
