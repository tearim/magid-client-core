# @magiden/client-core

The framework-free client for the Magid storytelling server: transport, session and recovery
protocol, response parsing and presentation semantics. No DOM and no framework, zero runtime dependencies. Use it from
React, Angular, a plain page or Node, and only draw what it hands you.

```ts
import { MagidClient, prepareDisplayText, truncateHtml } from '@magiden/client-core';

const client = new MagidClient({ baseUrl: 'https://stories.example.org', clientType: 'pure' });

client.subscribe((state) => {
  // state.elements: what to render (narration, menus, …); state.stylesheets: CSS the story asks for;
  // state.htmlPolicy: which HTML the server allows in display text.
});
client.on('notice', ({ message }) => console.info(message));

await client.send('');                 // open a session / fetch the current menu
await client.send('go-north');         // reply to the story: cmd=story-reply&reply=go-north
if (client.can('reload-xml')) await client.resetStory();
```

- **One command at a time:** commands are queued; each resolves when it has finished.
- **Server capabilities:** `can(command)` follows the server's `allowed-commands`; disallowed commands are refused
  without a request.
- **Display text** may carry HTML the server allows. `prepareDisplayText` returns a sanitized tree (never use
  `innerHTML`) and the visible text for typewriter effects.
- `fetch` and storage are injectable (`MagidClientOptions`); by default the session lives in memory.

## Changes

- **0.6.1**: the story list the server sends with a new session (`available-xmls`, a JSON string) reaches
  `state.xmlList`; it used to stay empty until `refreshXmlList`.
- **0.6.0**: `scopeStylesheet(css, scope)` scopes a stylesheet to an embedded Magid (a shadow root with
  `':host'`, or a selector such as `'#magid-app'`); `@font-face`/`@property` come back separately for the page.
- **0.5.1**: only the first `type-by-*` class counts, so an explicit `type-by-letter-*` is no longer overridden by an
  implied `type-by-word-*` (the config used to set both, and renderers picked word).
- **0.5.0** (breaking): replies to the story are sent as `cmd=story-reply&reply=<reply>`; `cmd` only names server
  commands, so a story can use any word, even one named like a server command. `send(reply)` always sends a story reply
  (`''` still goes out as `cmd=`); `selectStory`/`resetStory` and the other server actions keep `cmd=<name>`. New:
  `sendStoryReply`, `STORY_REPLY`. Needs a server that knows `story-reply`; an older one takes `story-reply` itself as the
  player's reply.
- **0.4.0** (breaking): the session id is sent in the `Magid-Session` header instead of `Authorization: Bearer …`,
  which the server now reserves for a user's identity token. Needs a server that reads `Magid-Session`.
  `TransportConfig.authToken` is renamed `sessionId`.

## Development

```sh
npm install        # also builds dist/
npm test           # vitest (Node)
npm run typecheck
npm run lint
npm run build
```

## License

[Apache-2.0](LICENSE)
