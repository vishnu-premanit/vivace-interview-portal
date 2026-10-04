'use strict';

/**
 * Mistake Memory Engine.
 * Turns a single evaluation into a list of *recurring-pattern* candidates.
 * The route layer upserts them into the Mistake collection (count, last seen,
 * examples). A mistake is "resolved" after it has not reappeared for
 * RESOLVE_AFTER consecutive answers — and is brought back to the candidate as
 * a reminder at the start of the next interview until then.
 */

const RESOLVE_AFTER = 4;

const CATALOG = {
  'filler-overuse': { label: 'Leaning on filler words', tip: 'Swap "um/like/basically" for a one-beat silent pause.' },
  'no-quantified-result': { label: 'Results without numbers', tip: 'End stories with a figure: %, time saved, users, marks.' },
  'too-short': { label: 'Answers too brief', tip: 'Give a headline, one example, and a takeaway — about 60–150 words.' },
  rambling: { label: 'Rambling answers', tip: 'Lead with the answer in one sentence, then support it. Stop when the point lands.' },
  hedging: { label: 'Hedging and under-selling', tip: 'Say "I recommend…" instead of "I guess maybe…".' },
  'missing-structure': { label: 'Stories missing STAR parts', tip: 'Run through Situation → Task → Action → Result before you speak.' },
  'we-not-i': { label: 'Saying "we" instead of "I"', tip: 'Interviewers score your contribution — name your own actions.' },
  'slow-start': { label: 'Long silence before answering', tip: 'Use a holding line: "Good question — let me take a second."' },
  'rushed-start': { label: 'Jumping in without thinking', tip: 'Pause 3 seconds on hard questions to plan two points.' },
  'concept-gap': { label: 'Missing core concepts', tip: 'Review the concepts flagged under "missing" in your reports.' },
  'pace-fast': { label: 'Speaking too fast', tip: 'Aim for 130–160 words per minute; breathe between points.' }
};

function detectMistakes(evaluation, { type = 'technical', answer = '' } = {}) {
  const found = [];
  const words = evaluation.stats ? evaluation.stats.words : 0;
  if (evaluation.fillers && ['noticeable', 'heavy'].includes(evaluation.fillers.level)) {
    found.push({ code: 'filler-overuse', detail: evaluation.fillers.top.map((t) => t.word).join(', ') });
  }
  if (type !== 'technical' && evaluation.star && evaluation.star.components) {
    if (evaluation.star.components.result.present && !evaluation.star.quantified) found.push({ code: 'no-quantified-result' });
    if (evaluation.star.missing.length >= 2) found.push({ code: 'missing-structure', detail: evaluation.star.missing.join(', ') });
  }
  if (words > 0 && words < 30) found.push({ code: 'too-short' });
  if (words > 300) found.push({ code: 'rambling' });
  if (evaluation.stats && evaluation.stats.hedges >= 3) found.push({ code: 'hedging' });
  const we = (answer.match(/\bwe\b/gi) || []).length;
  const i = (answer.match(/\bi\b/gi) || []).length;
  if (type !== 'technical' && we > 3 && we > i * 2) found.push({ code: 'we-not-i' });
  if (evaluation.timing) {
    if (evaluation.timing.thinkVerdict === 'long') found.push({ code: 'slow-start' });
    if (evaluation.timing.thinkVerdict === 'rushed') found.push({ code: 'rushed-start' });
    if (evaluation.timing.paceVerdict === 'fast') found.push({ code: 'pace-fast' });
  }
  if (evaluation.gaps && !evaluation.gaps.unavailable && evaluation.gaps.coverage < 0.4 && evaluation.gaps.missing.length) {
    found.push({ code: 'concept-gap', detail: evaluation.gaps.missing.slice(0, 2).join(', ') });
  }
  return found.map((f) => ({ ...f, ...CATALOG[f.code] }));
}

module.exports = { detectMistakes, CATALOG, RESOLVE_AFTER };
