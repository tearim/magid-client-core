import { hasTimeLineStops, parseTextSegments } from './textTimeline.ts';
import type { TypingConfig } from './typingConfig.ts';

// When a typewriter shows how much of a display text: renderers set timers from `steps` and show the first `length`
// characters of `text` (the marker-free text) at `at` ms after the text appears. No steps: show `text` at once.
// The last step always shows the whole text.
export interface TypingStep {
  at: number;
  length: number;
}

export interface TypingSchedule {
  text: string;
  steps: TypingStep[];
}

// - type-by-letter-*: one character every typeElementMs, each DCSTP_ segment starting after its offset plus the time
//   the segments before it took to type.
// - type-by-word-*: the same by words (split on spaces).
// - No typing class: each DCSTP_ segment appears whole at its offset.
// - Without typing, `skip` (the player skipped timelines) or a text without DCSTP_ markers shows the text at once.
export function typingSchedule(timeline: string, config: Partial<TypingConfig> = {}, skip = false): TypingSchedule {
  const byLetter = config.typeEachLetter === true;
  const byWord = !byLetter && config.typeEachWord === true;
  const elementMs = Number.isFinite(config.typeElementMs) ? Number(config.typeElementMs) : 0;
  const segments = parseTextSegments(timeline);
  const text = segments.map((s) => s.text).join('');

  if (!byLetter && !byWord && (skip || !hasTimeLineStops(timeline))) return { text, steps: [] };

  const steps: TypingStep[] = [];
  let shown = 0;
  let segmentStart = 0;
  let typingTime = 0;
  for (const segment of segments) {
    if (byLetter || byWord) {
      segmentStart = segment.offsetMs + typingTime;
      const units = byLetter ? Array.from(segment.text) : segment.text.split(' ');
      let length = shown;
      units.forEach((unit, i) => {
        length += (byWord && i > 0 ? 1 : 0) + unit.length;
        steps.push({ at: segmentStart + i * elementMs, length });
      });
      typingTime += units.length * elementMs;
    } else {
      steps.push({ at: segment.offsetMs, length: shown + segment.text.length });
    }
    shown += segment.text.length;
  }
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    const end = byLetter || byWord ? segmentStart + 1 + typingTime : last.offsetMs + 1;
    steps.push({ at: end, length: text.length });
  }
  // Timers fire in time order, equal times in the order they were set.
  return { text, steps: steps.map((s, i) => [s, i] as const).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map(([s]) => s) };
}
