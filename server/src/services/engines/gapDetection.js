'use strict';
const { stems, tokenize, stem, normalize } = require('../../utils/text');

/**
 * Answer Gap Detection.
 * Each expected key point may have alternatives ("hash|salt"). A key point is
 * covered when, for any alternative, at least half of its content stems appear
 * in the answer (or the exact phrase does). Returns what was covered and what
 * the candidate left out, which drives both feedback and counter-questions.
 */

function alternativeCovered(alt, answerNorm, answerStems) {
  const phrase = normalize(alt);
  if (!phrase) return false;
  if (answerNorm.includes(phrase)) return true;
  const altStems = stems(phrase);
  if (!altStems.length) {
    // Key point made only of short/stop tokens such as "o(1)" — exact token match
    return tokenize(phrase).every((t) => answerNorm.includes(t));
  }
  const hits = altStems.filter((s) => answerStems.has(s) || [...answerStems].some((a) => a.length > 4 && s.length > 4 && (a.startsWith(s) || s.startsWith(a))));
  // One- and two-word points need every word; longer phrases need most of them.
  return hits.length / altStems.length >= (altStems.length <= 2 ? 1 : 0.6);
}

function detectGaps(answer, keyPoints = []) {
  const answerNorm = normalize(answer);
  const answerStems = new Set(stems(answer));
  const covered = [];
  const missing = [];
  for (const kp of keyPoints) {
    const alts = String(kp).split('|').map((a) => a.trim()).filter(Boolean);
    const hit = alts.some((alt) => alternativeCovered(alt, answerNorm, answerStems));
    const label = alts[0];
    (hit ? covered : missing).push(label);
  }
  const coverage = keyPoints.length ? covered.length / keyPoints.length : 0;
  return { covered, missing, coverage: Math.round(coverage * 100) / 100 };
}

/** Bag-of-stems cosine similarity — JS fallback for the ML service's TF-IDF similarity. */
function similarity(a, b) {
  const va = new Map();
  const vb = new Map();
  for (const s of stems(a)) va.set(s, (va.get(s) || 0) + 1);
  for (const s of stems(b)) vb.set(s, (vb.get(s) || 0) + 1);
  let dot = 0;
  for (const [k, v] of va) if (vb.has(k)) dot += v * vb.get(k);
  const norm = (m) => Math.sqrt([...m.values()].reduce((acc, v) => acc + v * v, 0));
  const denom = norm(va) * norm(vb);
  return denom ? Math.round((dot / denom) * 1000) / 1000 : 0;
}

module.exports = { detectGaps, similarity, stemWord: stem };
