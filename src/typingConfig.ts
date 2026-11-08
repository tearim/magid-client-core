// Typing style from a narration/menu class string: type-by-letter-{ms|slow|normal|fast|rapid},
// type-by-word-{…}, animation-resets-{ms}. Only the first type-by-* class counts.
export interface TypingConfig { typeEachLetter: boolean; typeEachWord: boolean; typeElementMs: number, animationResets: number }

const NAMED_SPEEDS: Record<string, number> = {
  slow: 30,
  normal: 20,
  fast: 10,
  rapid: 5,
};

export function getConsequentalTypingConfig(className?: string): TypingConfig {
  if (!className) return { typeEachLetter: false, typeEachWord: false,  typeElementMs: 0, animationResets: 0  };
  // The first type-by-* class wins, whichever family it is: explicit classes come before implied ones
  // (applyImpliedClasses appends), so an implied type-by-word-* can't override an explicit type-by-letter-*.
  const firstMatch = className.match(/\btype-by-(letter|word)-(\S+)/);
  const match = firstMatch?.[1] === 'letter' ? [firstMatch[0], firstMatch[2]] : null;
  const wordMatch = firstMatch?.[1] === 'word' ? [firstMatch[0], firstMatch[2]] : null;
  const resetsMatch = className.match(/\banimation-resets-(\S+)/);
  let resets = 0;
  if (resetsMatch) {
    resets = parseInt(resetsMatch[1], 10);
  }
 //console.log('class:' + className)
  if (!match && !wordMatch) return { typeEachLetter: false, typeEachWord: false, typeElementMs: 0, animationResets: 0 };

  const workingMatch = match ? match : wordMatch;
  if ( !workingMatch ) return { typeEachLetter: false, typeEachWord: false,  typeElementMs: 0, animationResets: resets  };
  const tEL = match !== null  ;
  const tEW = wordMatch !== null;
  const value = workingMatch[1];
  if (value in NAMED_SPEEDS) {
    return { typeEachLetter: tEL, typeEachWord: tEW, typeElementMs: NAMED_SPEEDS[value], animationResets: resets  };
  }

  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return { typeEachLetter: tEL, typeEachWord: tEW, typeElementMs: parsed, animationResets: resets  };
  }

  return { typeEachLetter: false, typeEachWord: false, typeElementMs: 0, animationResets: 0  };
}
