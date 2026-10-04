'use strict';
const { round, clamp } = require('../../utils/text');

/**
 * Response-Time Intelligence.
 * Separates "thinking time" (question shown → first keystroke / first word)
 * from "answer time", and judges both against the difficulty of the question.
 * A quick answer to a hard question is a red flag; a long pause on an easy one too.
 */

// Ideal thinking window in seconds per difficulty level.
const THINK_WINDOW = { 1: [1, 8], 2: [2, 10], 3: [3, 14], 4: [4, 18], 5: [5, 22] };
// Comfortable spoken pace (words per minute). Typing is judged separately.
const SPOKEN_WPM = [110, 170];

function analyzeResponseTime({ thinkTimeMs = 0, answerDurationMs = 0, wordCount = 0, difficulty = 2, mode = 'text', timeLimitSec = 0 } = {}) {
  const thinkSec = round(Math.max(0, thinkTimeMs) / 1000, 1);
  const answerSec = round(Math.max(0, answerDurationMs) / 1000, 1);
  const [lo, hi] = THINK_WINDOW[difficulty] || THINK_WINDOW[2];
  const spoken = mode !== 'text';
  const wpm = answerSec >= 3 ? Math.round(wordCount / (answerSec / 60)) : null;

  let thinkVerdict = 'ideal';
  if (thinkSec < lo * 0.5 && difficulty >= 3) thinkVerdict = 'rushed';
  else if (thinkSec > hi * 1.6) thinkVerdict = 'long';
  else if (thinkSec > hi) thinkVerdict = 'slightly-long';

  let paceVerdict = null;
  if (spoken && wpm !== null) {
    if (wpm < SPOKEN_WPM[0] * 0.8) paceVerdict = 'slow';
    else if (wpm > SPOKEN_WPM[1] * 1.15) paceVerdict = 'fast';
    else paceVerdict = 'comfortable';
  }

  // Score: 100 when in window, decays outside it.
  let score = 100;
  if (thinkVerdict === 'rushed') score -= 20;
  if (thinkVerdict === 'slightly-long') score -= 10;
  if (thinkVerdict === 'long') score -= 30;
  if (paceVerdict === 'slow' || paceVerdict === 'fast') score -= 15;
  if (timeLimitSec && answerSec > timeLimitSec) score -= 15;
  if (answerSec > 0 && answerSec < 12 && difficulty >= 3) score -= 15;

  const notes = [];
  if (thinkVerdict === 'rushed') notes.push(`You started within ${thinkSec}s on a level-${difficulty} question. A 3–5 second pause to plan reads as confident, not slow.`);
  if (thinkVerdict === 'long' || thinkVerdict === 'slightly-long') notes.push(`You took ${thinkSec}s before starting. Try a holding line like "Let me think about the trade-offs for a second" so silence doesn't stretch.`);
  if (paceVerdict === 'fast') notes.push(`About ${wpm} words per minute — fast enough that key points may get lost. Aim for 130–160.`);
  if (paceVerdict === 'slow') notes.push(`About ${wpm} words per minute — a little slow. Shorter sentences help keep momentum.`);
  if (timeLimitSec && answerSec > timeLimitSec) notes.push(`You went past the ${timeLimitSec}s limit. Lead with the headline, then add detail.`);

  return {
    thinkSec,
    answerSec,
    wpm,
    idealThink: [lo, hi],
    thinkVerdict,
    paceVerdict,
    score: clamp(score),
    notes
  };
}

module.exports = { analyzeResponseTime, THINK_WINDOW };
