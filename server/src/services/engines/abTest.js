'use strict';
const { evaluateAnswer } = require('./evaluator');

/**
 * A/B Answer Testing — score two versions of the same answer side by side and
 * explain which choices made the difference.
 */

const DIMENSIONS = ['relevance', 'depth', 'structure', 'clarity', 'confidence'];

function compareAnswers({ question, answerA, answerB, keyPoints = [], type = 'behavioral' }) {
  const a = evaluateAnswer({ answer: answerA, question, keyPoints, type });
  const b = evaluateAnswer({ answer: answerB, question, keyPoints, type });
  const dims = DIMENSIONS.map((d) => ({ key: d, a: a.scores[d], b: b.scores[d], diff: Math.round((b.scores[d] - a.scores[d]) * 10) / 10 }));
  const delta = Math.round((b.overall - a.overall) * 10) / 10;
  const winner = Math.abs(delta) < 0.3 ? 'tie' : delta > 0 ? 'B' : 'A';

  const reasons = [];
  const better = winner === 'B' ? { w: b, l: a, name: 'B' } : { w: a, l: b, name: 'A' };
  if (winner !== 'tie') {
    if (better.w.fillers.perHundred + 1 < better.l.fillers.perHundred) reasons.push(`Version ${better.name} uses fewer filler words.`);
    if (better.w.star.score > better.l.star.score + 10) reasons.push(`Version ${better.name} follows the STAR structure more completely.`);
    if (better.w.star.quantified && !better.l.star.quantified) reasons.push(`Version ${better.name} puts a number on the result.`);
    if (better.w.gaps.coverage > better.l.gaps.coverage) reasons.push(`Version ${better.name} covers more of the points an interviewer listens for.`);
    if (better.w.stats.hedges < better.l.stats.hedges) reasons.push(`Version ${better.name} hedges less and sounds more decisive.`);
    if (better.w.stats.words > better.l.stats.words * 1.3 && better.l.stats.words < 60) reasons.push(`Version ${better.name} gives enough detail; the other is too thin.`);
    if (better.w.stats.words < better.l.stats.words * 0.75 && better.l.stats.words > 250) reasons.push(`Version ${better.name} is tighter; the other runs long.`);
  }
  if (!reasons.length) reasons.push(winner === 'tie' ? 'Both versions land about the same. Try changing one thing at a time — structure, numbers, or length.' : `Version ${better.name} scores higher across several dimensions.`);

  const keep = [];
  for (const d of dims) {
    if (d.diff >= 1) keep.push(`Keep B's ${d.key}`);
    if (d.diff <= -1) keep.push(`Keep A's ${d.key}`);
  }

  return { winner, delta, dims, a: slim(a), b: slim(b), reasons, merge: keep.length ? keep : ['Both versions are comparable on every dimension.'] };
}

function slim(e) {
  return { overall: e.overall, scores: e.scores, fillers: { perHundred: e.fillers.perHundred, top: e.fillers.top, marks: e.fillers.marks }, star: { score: e.star.score, missing: e.star.missing, quantified: e.star.quantified }, gaps: e.gaps, stats: e.stats, feedback: e.feedback };
}

module.exports = { compareAnswers };
