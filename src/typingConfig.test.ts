import { describe, it, expect } from 'vitest';
import { getConsequentalTypingConfig } from './typingConfig.ts';
import { applyImpliedClasses } from './impliedClasses.ts';

describe('getConsequentalTypingConfig', () => {
  it('types by letter at the given speed', () => {
    expect(getConsequentalTypingConfig('talking type-by-letter-40')).toEqual({
      typeEachLetter: true, typeEachWord: false, typeElementMs: 40, animationResets: 0,
    });
  });

  it('types by word at a named speed with animation resets', () => {
    expect(getConsequentalTypingConfig('type-by-word-fast animation-resets-3')).toEqual({
      typeEachLetter: false, typeEachWord: true, typeElementMs: 10, animationResets: 3,
    });
  });

  it('lets the first type-by-* class win over a later one of the other family', () => {
    expect(getConsequentalTypingConfig('type-by-letter-40 type-by-word-50')).toEqual({
      typeEachLetter: true, typeEachWord: false, typeElementMs: 40, animationResets: 0,
    });
    expect(getConsequentalTypingConfig('type-by-word-50 type-by-letter-40')).toEqual({
      typeEachLetter: false, typeEachWord: true, typeElementMs: 50, animationResets: 0,
    });
  });

  it('keeps an explicit type-by-letter-* when an implied class adds type-by-word-*', () => {
    // The oasis hermit: class="hermit-talking type-by-letter-40", var implied-classes-of: hermit-talking* = type-by-word-50.
    const className = applyImpliedClasses('hermit-talking type-by-letter-40', { 'implied-classes-of: hermit-talking*': 'type-by-word-50' });
    expect(className).toContain('type-by-word-50'); // precondition
    expect(getConsequentalTypingConfig(className)).toMatchObject({ typeEachLetter: true, typeEachWord: false, typeElementMs: 40 });
  });

  it('does not type without a type-by-* class', () => {
    expect(getConsequentalTypingConfig('talking')).toMatchObject({ typeEachLetter: false, typeEachWord: false });
    expect(getConsequentalTypingConfig(undefined)).toMatchObject({ typeEachLetter: false, typeEachWord: false });
  });
});
