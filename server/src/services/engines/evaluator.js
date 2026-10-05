'use strict';
const { tokenize, sentences, stems, clamp, round, mean } = require('../../utils/text');
const { analyzeFillers } = require('./fillerWords');
const { analyzeStar } = require('./star');
const { detectGaps, similarity } = require('./gapDetection');
const { analyzeResponseTime } = require('./responseTime');

/**
 * Offline answer evaluator. Produces the same shape as the Gemini evaluation so
 * the rest of the pipeline never has to care which one ran. Deterministic
 * signals (fillers, STAR, timing, gaps) are always computed here — Gemini only
 * replaces the semantic scores when it is available.
 */

const HEDGES = /\b(i think|i guess|maybe|probably|perhaps|not sure|i don't know|kind of|sort of|i feel like|might be|hopefully|i suppose)\b/gi;
const ASSERTIVE = /\b(i (built|led|designed|delivered|decided|owned|created|improved|reduced|increased|solved|fixed|launched|managed|wrote))\b/gi;
const EXAMPLE = /\b(for example|for instance|such as|e\.g\.|in my project|in my internship|when i|once,? i|at my)\b/i;
const NUMBER = /\b\d+([.,]\d+)?\s?(%|percent|x|k|ms|s|seconds|minutes|hours|days|weeks|months|years|users|people|lakhs?|crores?|rs|₹)?/i;
const CONNECTORS = /\b(first|second|third|then|next|finally|because|therefore|however|so that|as a result|on the other hand|for example|in short|to summari[sz]e)\b/gi;

const WEIGHTS = { relevance: 0.3, depth: 0.25, structure: 0.15, clarity: 0.15, confidence: 0.15 };

function scoreDimensions({ answer, question, keyPoints, type, fillers, star, gaps }) {
  const words = tokenize(answer).length;
  const sents = sentences(answer);
  const avgSentence = sents.length ? words / sents.length : words;

  // Relevance: key point coverage + lexical overlap with the question itself.
  const qOverlap = similarity(answer, question);
  const relevance = clamp(gaps.coverage * 7 + Math.min(1, qOverlap * 3) * 3, 0, 10);

  // Depth: length in a sensible band, examples, numbers, distinct concepts.
  const lengthScore = words < 15 ? 1 : words < 40 ? 4 : words < 80 ? 7 : words <= 260 ? 9 : 7;
  const distinct = new Set(stems(answer)).size;
  const depth = clamp(lengthScore * 0.6 + (EXAMPLE.test(answer) ? 1.6 : 0) + (NUMBER.test(answer) ? 1.2 : 0) + Math.min(1.2, distinct / 40) + gaps.coverage * 1.5, 0, 10);

  // Structure: STAR for behavioural, logical connectors for technical.
  const connectors = (answer.match(CONNECTORS) || []).length;
  const structure =
    type === 'technical'
      ? clamp(3 + Math.min(4, connectors * 1.2) + (sents.length >= 3 ? 2 : 0) + (gaps.coverage >= 0.6 ? 1 : 0), 0, 10)
      : clamp(star.score / 10 + Math.min(1, connectors * 0.3), 0, 10);

  // Clarity: sentence length + filler density.
  let clarity = 9;
  if (avgSentence > 35) clarity -= 2.5;
  else if (avgSentence > 25) clarity -= 1;
  if (avgSentence < 5 && words > 10) clarity -= 1.5;
  clarity -= Math.min(5, fillers.perHundred * 0.6);
  if (words < 12) clarity -= 3;
  clarity = clamp(clarity, 0, 10);

  // Confidence: assertive ownership minus hedging.
  const hedges = (answer.match(HEDGES) || []).length;
  const assertive = (answer.match(ASSERTIVE) || []).length;
  const confidence = clamp(6 + Math.min(3, assertive) - Math.min(4, hedges * 1.2) + (words > 40 ? 1 : -1), 0, 10);

  const scores = {
    relevance: round(relevance),
    depth: round(depth),
    structure: round(structure),
    clarity: round(clarity),
    confidence: round(confidence)
  };
  const overall = round(Object.entries(WEIGHTS).reduce((acc, [k, w]) => acc + scores[k] * w, 0));
  return { scores, overall, stats: { words, sentences: sents.length, avgSentence: round(avgSentence), hedges, assertive, connectors } };
}

function buildFeedback({ scores, gaps, fillers, star, type, stats, timing }) {
  const strengths = [];
  const improvements = [];
  if (gaps.coverage >= 0.7) strengths.push(`You hit the key ideas: ${gaps.covered.slice(0, 3).join(', ')}.`);
  if (scores.depth >= 7.5) strengths.push('Good depth — you backed points with specifics.');
  if (fillers.level === 'clean' && stats.words > 30) strengths.push('Clean delivery with almost no filler words.');
  if (type !== 'technical' && star.score >= 75) strengths.push('Well-structured story: situation, action and result were all there.');
  if (stats.assertive >= 2) strengths.push('You owned your actions with clear "I did" statements.');
  if (timing && timing.thinkVerdict === 'ideal' && timing.thinkSec > 0) strengths.push('Your pause before answering was well judged.');

  if (gaps.missing.length) improvements.push(`You didn't touch on: ${gaps.missing.slice(0, 3).join(', ')}.`);
  if (stats.words < 40) improvements.push('Too brief — aim for 60–150 words with one concrete example.');
  if (stats.words > 280) improvements.push('Long answer — lead with the headline, then add one supporting example.');
  if (fillers.level === 'noticeable' || fillers.level === 'heavy') {
    const top = fillers.top.map((t) => `"${t.word}" ×${t.count}`).join(', ');
    improvements.push(`Filler words are getting in the way (${top}). Replace them with a short pause.`);
  }
  if (type !== 'technical' && star.missing.length) improvements.push(star.tips[0]);
  if (stats.hedges >= 2) improvements.push('Several hedges ("I think", "maybe"). State your view, then qualify once if needed.');
  if (!strengths.length) strengths.push('You stayed on the question — build on that with more specifics.');
  return { strengths: strengths.slice(0, 4), improvements: improvements.filter(Boolean).slice(0, 4) };
}

function modelOutline(keyPoints = [], type) {
  const names = keyPoints.map((k) => String(k).split('|')[0]);
  if (type === 'technical') {
    return [`Start with a one-line definition or headline.`, ...names.map((n) => `Cover: ${n}.`), 'Close with a real example or trade-off from your own work.'];
  }
  return ['Situation — one or two sentences of context.', 'Task — what you were responsible for.', `Action — your steps, touching on: ${names.join(', ')}.`, 'Result — a measurable outcome and what you learned.'];
}

function evaluateAnswer({ answer, question, keyPoints = [], type = 'technical', difficulty = 2, metrics = {}, mode = 'text', language = 'en', timeLimitSec = 0 }) {
  const text = String(answer || '');
  const fillers = analyzeFillers(text, { durationMs: metrics.answerDurationMs });
  const star = analyzeStar(text, { type });
  const gapsAvailable = language === 'en' || /[a-z]{3}/i.test(text);
  const gaps = gapsAvailable ? detectGaps(text, keyPoints) : { covered: [], missing: [], coverage: 0.5, unavailable: true };
  // Story-shape key points ("situation", "result"…) count as covered when the STAR analyzer found them.
  if (!gaps.unavailable && gaps.missing.length) {
    const starMap = { situation: 'situation', context: 'situation', task: 'task', action: 'action', steps: 'action', result: 'result', outcome: 'result' };
    const still = [];
    for (const label of gaps.missing) {
      const comp = starMap[label];
      if (comp && star.components[comp] && star.components[comp].present) gaps.covered.push(label);
      else still.push(label);
    }
    gaps.missing = still;
    gaps.coverage = keyPoints.length ? Math.round((gaps.covered.length / keyPoints.length) * 100) / 100 : 0;
  }
  const timing = analyzeResponseTime({
    thinkTimeMs: metrics.thinkTimeMs,
    answerDurationMs: metrics.answerDurationMs,
    wordCount: tokenize(text).length,
    difficulty,
    mode,
    timeLimitSec
  });
  const { scores, overall, stats } = scoreDimensions({ answer: text, question, keyPoints, type, fillers, star, gaps });
  const feedback = buildFeedback({ scores, gaps, fillers, star, type, stats, timing });

  // Small timing adjustment so response-time intelligence actually matters.
  const adjusted = clamp(overall + (timing.score >= 90 ? 0.2 : timing.score < 60 ? -0.4 : 0), 0, 10);

  return {
    source: 'offline',
    overall: round(adjusted),
    scores,
    stats,
    fillers,
    star,
    gaps,
    timing,
    feedback,
    modelAnswer: modelOutline(keyPoints, type)
  };
}

function averageScores(evaluations) {
  const dims = Object.keys(WEIGHTS);
  const out = {};
  for (const d of dims) out[d] = round(mean(evaluations.map((e) => e && e.scores && e.scores[d])));
  return out;
}

module.exports = { evaluateAnswer, averageScores, WEIGHTS, modelOutline };
