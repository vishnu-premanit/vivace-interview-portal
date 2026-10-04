'use strict';
const { mean, stddev, clamp, round } = require('../../utils/text');

/**
 * Readiness Score (0–100) and Outcome Predictor.
 * Both work from a flat list of answer evaluations so they can be computed for
 * one session (report) or across a user's history (dashboard).
 */

const READINESS_WEIGHTS = [
  ['quality', 'Answer quality', 0.42],
  ['coverage', 'Concept coverage', 0.15],
  ['delivery', 'Delivery (fillers & clarity)', 0.13],
  ['structure', 'Structure (STAR)', 0.1],
  ['timing', 'Response timing', 0.07],
  ['consistency', 'Consistency', 0.07],
  ['practice', 'Practice volume', 0.06]
];

function readiness(evaluations, { sessions = 1, activeMistakes = [], includePractice = true } = {}) {
  const evals = evaluations.filter(Boolean);
  if (!evals.length) return { score: 0, band: 'Not enough data', breakdown: [], sampleSize: 0 };

  const overall = evals.map((e) => e.overall);
  const parts = {
    quality: mean(overall) * 10,
    coverage: mean(evals.filter((e) => !(e.gaps && e.gaps.unavailable)).map((e) => (e.gaps ? e.gaps.coverage : 0.5))) * 100 || 50,
    delivery: mean(evals.map((e) => clamp(100 - (e.fillers ? e.fillers.perHundred : 0) * 8) * 0.5 + (e.scores ? e.scores.clarity : 5) * 5)),
    structure: mean(evals.filter((e) => e.star && e.star.applicable).map((e) => e.star.score)) || mean(evals.map((e) => (e.scores ? e.scores.structure * 10 : 50))),
    timing: mean(evals.map((e) => (e.timing ? e.timing.score : 70))),
    consistency: clamp(100 - stddev(overall) * 22),
    practice: includePractice ? clamp((sessions / 8) * 100) : 100
  };
  let score = READINESS_WEIGHTS.reduce((acc, [k, , w]) => acc + parts[k] * w, 0);
  const penalty = Math.min(6, activeMistakes.filter((m) => m.count >= 3).length * 1.5);
  score = clamp(Math.round(score - penalty));

  let band = 'Getting started';
  if (score >= 85) band = 'Interview ready';
  else if (score >= 70) band = 'Nearly there';
  else if (score >= 50) band = 'Building up';

  return {
    score,
    band,
    penalty: round(penalty),
    sampleSize: evals.length,
    breakdown: READINESS_WEIGHTS.map(([key, label, weight]) => ({ key, label, weight, value: Math.round(parts[key]) }))
  };
}

// Logistic model — mirrors the ML service. Coefficients were fitted offline on
// synthetic, rubric-labelled interview data; the ML service refits them at boot.
const OUTCOME_MODEL = {
  intercept: -8.6,
  coef: { overall: 0.85, coverage: 1.6, confidence: 0.15, star: 0.012, fillers: -0.12, timing: 0.008, credibility: 0.01 },
  baseline: { overall: 6.5, coverage: 0.6, confidence: 6, star: 60, fillers: 3, timing: 75, credibility: 60 },
  labels: {
    overall: 'Overall answer quality',
    coverage: 'Key concepts covered',
    confidence: 'Confident delivery',
    star: 'Structured stories',
    fillers: 'Filler words',
    timing: 'Response timing',
    credibility: 'Resume credibility'
  }
};

function outcomeFeatures(evaluations, { credibility = null } = {}) {
  const evals = evaluations.filter(Boolean);
  return {
    overall: mean(evals.map((e) => e.overall)),
    coverage: mean(evals.map((e) => (e.gaps ? e.gaps.coverage : 0.5))),
    confidence: mean(evals.map((e) => (e.scores ? e.scores.confidence : 5))),
    star: mean(evals.filter((e) => e.star && e.star.applicable).map((e) => e.star.score)) || 50,
    fillers: mean(evals.map((e) => (e.fillers ? e.fillers.perHundred : 0))),
    timing: mean(evals.map((e) => (e.timing ? e.timing.score : 70))),
    credibility: credibility === null || credibility === undefined ? OUTCOME_MODEL.baseline.credibility : credibility
  };
}

function predictOutcome(features, model = OUTCOME_MODEL) {
  let z = model.intercept;
  const drivers = [];
  for (const [k, w] of Object.entries(model.coef)) {
    const v = features[k] ?? model.baseline[k];
    z += w * v;
    drivers.push({ key: k, label: model.labels[k], impact: round(w * (v - model.baseline[k]), 2) });
  }
  const probability = 1 / (1 + Math.exp(-z));
  const pct = Math.round(probability * 100);
  const band = pct >= 70 ? 'Likely to advance' : pct >= 40 ? 'Borderline' : 'Unlikely yet';
  drivers.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  return {
    probability: pct,
    band,
    helping: drivers.filter((d) => d.impact > 0.05).slice(0, 3),
    hurting: drivers.filter((d) => d.impact < -0.05).slice(0, 3),
    model: 'logistic-v1',
    disclaimer: 'An estimate from practice performance — not a guarantee of any real hiring decision.'
  };
}

module.exports = { readiness, predictOutcome, outcomeFeatures, OUTCOME_MODEL, READINESS_WEIGHTS };
