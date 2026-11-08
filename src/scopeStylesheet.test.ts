import { describe, it, expect } from 'vitest';
import { scopeSelector, scopeStylesheet } from './scopeStylesheet.ts';

describe('scopeSelector', () => {
  it('turns page-level selectors into :host', () => {
    expect(scopeSelector(':root', ':host')).toBe(':host');
    expect(scopeSelector('html', ':host')).toBe(':host');
    expect(scopeSelector('body .menu', ':host')).toBe(':host .menu');
    expect(scopeSelector('html > body .menu', ':host')).toBe(':host .menu');
    expect(scopeSelector('body.dark .menu', ':host')).toBe(':host(.dark) .menu');
  });

  it('leaves other selectors alone in a shadow root', () => {
    expect(scopeSelector('.menu button', ':host')).toBe('.menu button');
    expect(scopeSelector('*', ':host')).toBe('*');
    expect(scopeSelector('bodyguard', ':host')).toBe('bodyguard');
    expect(scopeSelector('.x body', ':host')).toBe('.x body');
  });

  it('prefixes every selector with an id scope', () => {
    expect(scopeSelector('.menu button', '#magid-app')).toBe('#magid-app .menu button');
    expect(scopeSelector('*', '#magid-app')).toBe('#magid-app *');
    expect(scopeSelector('*::before', '#magid-app')).toBe('#magid-app *::before');
    expect(scopeSelector(':root', '#magid-app')).toBe('#magid-app');
    expect(scopeSelector('body.dark > .menu', '#magid-app')).toBe('#magid-app.dark > .menu');
  });
});

describe('scopeStylesheet', () => {
  it('scopes every selector of a list', () => {
    expect(scopeStylesheet('*, *::before, body { margin: 0 }', '#m').css).toBe('#m *, #m *::before, #m { margin: 0 }');
  });

  it('keeps declarations, strings and comments between rules intact', () => {
    const css = '/* theme */\n:root { --x: "a{b};c" }\n.a { content: "}" }';
    expect(scopeStylesheet(css, ':host').css).toBe('/* theme */\n:host { --x: "a{b};c" }\n.a { content: "}" }');
  });

  it('drops comments inside a selector', () => {
    expect(scopeStylesheet('.a /* x */ .b { color: red }', '#m').css).toBe('#m .a   .b { color: red }');
  });

  it('scopes rules inside @media and @supports, also nested', () => {
    const css = '@media (min-width: 600px) { @supports (display: grid) { body .a { color: red } } }';
    expect(scopeStylesheet(css, '#m').css).toBe('@media (min-width: 600px) { @supports (display: grid) { #m .a { color: red } } }');
  });

  it('leaves @keyframes and statement at-rules as they are', () => {
    const css = '@import url("x;y.css");\n@keyframes fade { from { opacity: 0 } to { opacity: 1 } }';
    expect(scopeStylesheet(css, '#m').css).toBe(css);
  });

  it('moves @font-face and @property to documentCss', () => {
    const css = '@font-face { font-family: "Sigil"; src: url(x.woff2) }\n@property --a { syntax: "<color>"; inherits: true }\n.a { font-family: Sigil }';
    const scoped = scopeStylesheet(css, ':host');
    expect(scoped.css).toBe('\n\n.a { font-family: Sigil }');
    expect(scoped.documentCss).toBe('@font-face { font-family: "Sigil"; src: url(x.woff2) }\n@property --a { syntax: "<color>"; inherits: true }');
  });

  it('keeps selectors with commas inside :is() or attribute values together', () => {
    expect(scopeStylesheet(':is(.a, .b) [data-x="1,2"] { color: red }', '#m').css).toBe('#m :is(.a, .b) [data-x="1,2"] { color: red }');
  });

  it('copes with a sheet cut off inside a rule', () => {
    expect(scopeStylesheet('.a { color: red', '#m').css).toBe('#m .a { color: red}');
  });
});
