# @magid/client-core

The framework-free client for the Magid storytelling server: transport, session and recovery
protocol, response parsing and presentation semantics. No DOM and no framework, zero runtime dependencies. Use it from
React, Angular, a plain page or Node, and only draw what it hands you.

```ts
import { MagidClient, prepareDisplayText, truncateHtml } from '@magid/client-core';

const client = new MagidClient({ baseUrl: 'https://stories.example.org', clientType: 'pure' });

client.subscribe((state) => {
  // state.elements: what to render (narration, menus, …); state.stylesheets: CSS the story asks for;
  // state.htmlPolicy: which HTML the server allows in display text.
});
client.on('notice', ({ message }) => console.info(message));

await client.send('');                 // open a session / fetch the current menu
if (client.can('reload-xml')) await client.resetStory();
```

- **One command at a time:** commands are queued; each resolves when it has finished.
- **Server capabilities:** `can(command)` follows the server's `allowed-commands`; disallowed commands are refused
  without a request.
- **Display text** may carry HTML the server allows. `prepareDisplayText` returns a sanitized tree (never use
  `innerHTML`) and the visible text for typewriter effects.
- `fetch` and storage are injectable (`MagidClientOptions`); by default the session lives in memory.

## Development

```sh
npm install        # also builds dist/
npm test           # vitest (Node)
npm run typecheck
npm run lint
npm run build
```
