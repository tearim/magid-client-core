// Scopes a stylesheet to one Magid instance on a page that isn't Magid's own (embedding):
// - scope ':host' (the CSS goes into the instance's shadow root): selectors already only reach the shadow root's
//   content, so only the page-level ones are rewritten: `:root`, `html`, `body` → `:host` (`body.dark` → `:host(.dark)`).
// - scope '#magid-app' (or any selector; the CSS goes into the page's <head>): every selector is prefixed with it, and
//   `:root`/`html`/`body` become the scope itself (`body.dark` → `#magid-app.dark`).
// Rules inside @media/@supports/@container/@layer/@starting-style are scoped too; @keyframes and other at-rules are left
// as they are. @font-face and @property don't work inside a shadow root, so they're returned separately (documentCss),
// for the page's <head>. Comments between rules are kept; comments inside a selector are dropped.
export interface ScopedStylesheet {
  css: string;
  documentCss: string;
}

// At-rules whose block holds rules that need scoping.
const GROUPING = new Set(['media', 'supports', 'container', 'layer', 'starting-style']);
// At-rules that only take effect at document level.
const DOCUMENT_LEVEL = new Set(['font-face', 'property']);

export function scopeStylesheet(css: string, scope: string): ScopedStylesheet {
  const documentRules: string[] = [];
  const scoped = scopeRules(css, scope, documentRules);
  return { css: scoped, documentCss: documentRules.join('\n') };
}

function scopeRules(src: string, scope: string, documentRules: string[]): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const stop = scanTo(src, i);
    if (stop === -1) {
      out += src.slice(i);
      break;
    }
    const prelude = src.slice(i, stop);
    if (src[stop] === ';' || src[stop] === '}') {
      // A statement at-rule (@import, @charset, @layer a, b;), or a stray character: kept as it is.
      out += src.slice(i, stop + 1);
      i = stop + 1;
      continue;
    }
    const close = matchingBrace(src, stop);
    const body = src.slice(stop + 1, close === -1 ? src.length : close);
    const { trivia, head } = splitLeadingTrivia(prelude);
    if (head.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(head)?.[1].toLowerCase() ?? '';
      if (DOCUMENT_LEVEL.has(name)) {
        documentRules.push(`${head.trim()} {${body}}`);
        out += trivia;
      } else if (GROUPING.has(name)) {
        out += `${trivia}${head}{${scopeRules(body, scope, documentRules)}}`;
      } else {
        out += `${trivia}${head}{${body}}`;
      }
    } else {
      out += `${trivia}${scopeSelectorList(stripComments(head).trim(), scope)} {${body}}`;
    }
    if (close === -1) break;
    i = close + 1;
  }
  return out;
}

const ROOT_COMPOUND = /^(?::root|html|body)(?![\w-])([^\s>+~]*)/i;
const BETWEEN_ROOTS = /^\s*(?:>\s*)?(?=(?::root|html|body)(?![\w-]))/i;

export function scopeSelector(selector: string, scope: string): string {
  let rest = selector.trim();
  let attached = '';
  let atRoot = false;
  // `html body.dark > .x`: the leading page-level compounds collapse into the scope.
  for (;;) {
    const m = ROOT_COMPOUND.exec(rest);
    if (!m) break;
    atRoot = true;
    attached += m[1];
    rest = rest.slice(m[0].length);
    const gap = BETWEEN_ROOTS.exec(rest);
    if (!gap) break;
    rest = rest.slice(gap[0].length);
  }
  if (scope === ':host') {
    if (!atRoot) return selector.trim();
    return (attached ? `:host(${attached})` : ':host') + rest;
  }
  if (atRoot) return scope + attached + rest;
  return `${scope} ${rest}`;
}

function scopeSelectorList(list: string, scope: string): string {
  return splitTopLevel(list, ',').map((s) => scopeSelector(s, scope)).join(', ');
}

// ---- scanning (strings, comments and parentheses never end a prelude or a block) ----------------------------------

function skipString(src: string, i: number): number {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
  return j + 1;
}

function skipComment(src: string, i: number): number {
  const end = src.indexOf('*/', i + 2);
  return end === -1 ? src.length : end + 2;
}

// Index of the next top-level '{', ';' or '}' from i, or -1.
function scanTo(src: string, i: number): number {
  let parens = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    if (c === '(') parens++;
    else if (c === ')') parens = Math.max(0, parens - 1);
    else if (parens === 0 && (c === '{' || c === ';' || c === '}')) return i;
    i++;
  }
  return -1;
}

// Index of the '}' closing the '{' at `open`, or -1 when the sheet ends first.
function matchingBrace(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipComment(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
    i++;
  }
  return -1;
}

// Whitespace and comments before a rule stay where they are.
function splitLeadingTrivia(prelude: string): { trivia: string; head: string } {
  let i = 0;
  for (;;) {
    while (i < prelude.length && /\s/.test(prelude[i])) i++;
    if (prelude.startsWith('/*', i)) { i = skipComment(prelude, i); continue; }
    break;
  }
  return { trivia: prelude.slice(0, i), head: prelude.slice(i) };
}

function stripComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' || s[i] === "'") { const j = skipString(s, i); out += s.slice(i, j); i = j; continue; }
    if (s.startsWith('/*', i)) { i = skipComment(s, i); out += ' '; continue; }
    out += s[i++];
  }
  return out;
}

function splitTopLevel(s: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === separator && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
    i++;
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}
