import { describe, it, expect } from 'vitest';
import { typingSchedule } from './typingSchedule.ts';

const letter = (ms: number) => ({ typeEachLetter: true, typeElementMs: ms });
const word = (ms: number) => ({ typeEachWord: true, typeElementMs: ms });

describe('typingSchedule', () => {
  it('shows a text without markers or typing at once', () => {
    expect(typingSchedule('Hello there')).toEqual({ text: 'Hello there', steps: [] });
  });

  it('shows each DCSTP_ segment whole at its offset', () => {
    expect(typingSchedule('Hi DCSTP_500@there DCSTP_250@you')).toEqual({
      text: 'Hi there you',
      steps: [{ at: 0, length: 3 }, { at: 500, length: 9 }, { at: 750, length: 12 }, { at: 751, length: 12 }],
    });
  });

  it('skips the timeline at once when asked, with the clean text', () => {
    expect(typingSchedule('Hi DCSTP_500@there', {}, true)).toEqual({ text: 'Hi there', steps: [] });
  });

  it('types letter by letter', () => {
    const { text, steps } = typingSchedule('abc', letter(10));
    expect(text).toBe('abc');
    // The end: last segment start + 1 + the typing time (3 × 10 ms).
    expect(steps).toEqual([{ at: 0, length: 1 }, { at: 10, length: 2 }, { at: 20, length: 3 }, { at: 31, length: 3 }]);
  });

  it('starts a later segment after its offset plus the typing time before it', () => {
    const { steps } = typingSchedule('abDCSTP_100@cd', letter(10));
    // ab at 0 and 10 (20 ms of typing); cd at 100 + 20 and 130; the end at 120 + 1 + 40 ms of typing.
    expect(steps).toEqual([{ at: 0, length: 1 }, { at: 10, length: 2 }, { at: 120, length: 3 }, { at: 130, length: 4 }, { at: 161, length: 4 }]);
  });

  it('types word by word, keeping the spaces', () => {
    const { text, steps } = typingSchedule('one two three', word(50));
    expect(text).toBe('one two three');
    expect(steps).toEqual([{ at: 0, length: 3 }, { at: 50, length: 7 }, { at: 100, length: 13 }, { at: 151, length: 13 }]);
  });

  it('types even when timelines are skipped, if a typing class asks for it', () => {
    expect(typingSchedule('ab', letter(5), true).steps.length).toBeGreaterThan(0);
  });

  it('never splits a character outside the basic plane', () => {
    const { text, steps } = typingSchedule('a😀b', letter(10));
    const shown = steps.map((s) => text.slice(0, s.length));
    expect(shown).toEqual(['a', 'a😀', 'a😀b', 'a😀b']);
  });

  it('ends every schedule with the whole text', () => {
    for (const config of [{}, letter(7), word(9)]) {
      const { text, steps } = typingSchedule('x DCSTP_40@y z DCSTP_10@w', config);
      expect(steps.at(-1)?.length).toBe(text.length);
      expect(steps.map((s) => s.at)).toEqual([...steps.map((s) => s.at)].sort((a, b) => a - b));
    }
  });
});
