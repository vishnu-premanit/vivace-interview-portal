'use strict';
const { COMPETENCIES, getStream, allQuestionsFor } = require('../data/streams');
const { mean, stddev, round, clamp } = require('../../utils/text');

/**
 * Skill Gap Map, Interview Digital Twin and Weakness-to-Question Engine.
 * All three read the same flattened "answered turns" list:
 *   { competency, difficulty, evaluation, questionId, mode, stress, at }
 */

const DEFAULT_TARGET = { domain: 72, problemSolving: 70, analytical: 70, communication: 70, teamwork: 65, leadership: 55, adaptability: 65, professionalism: 65 };

function competencyStats(turns) {
  const stats = {};
  for (const c of COMPETENCIES) stats[c.id] = { id: c.id, label: c.label, scores: [], difficulties: [] };
  for (const t of turns) {
    if (!t.evaluation || !stats[t.competency]) continue;
    stats[t.competency].scores.push(t.evaluation.overall * 10);
    stats[t.competency].difficulties.push(t.difficulty || 2);
  }
  return Object.values(stats).map((s) => {
    const recent = s.scores.slice(-3);
    const earlier = s.scores.slice(0, -3);
    return {
      id: s.id,
      label: s.label,
      n: s.scores.length,
      mean: s.scores.length ? Math.round(mean(s.scores)) : null,
      avgDifficulty: s.difficulties.length ? round(mean(s.difficulties)) : null,
      trend: earlier.length && recent.length ? Math.round(mean(recent) - mean(earlier)) : 0
    };
  });
}

function skillGapMap(turns, streamId, { resumeSkills = [], jdMissing = [] } = {}) {
  const stream = getStream(streamId);
  const target = (stream && stream.focus) || DEFAULT_TARGET;
  const comps = competencyStats(turns);
  const axes = comps.map((c) => {
    const t = target[c.id] ?? 65;
    const current = c.mean;
    return { id: c.id, label: c.label, current, target: t, gap: current === null ? null : Math.max(0, t - current), n: c.n, trend: c.trend };
  });
  const measured = axes.filter((a) => a.current !== null);
  const priorities = measured
    .filter((a) => a.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((a) => ({ id: a.id, label: a.label, gap: a.gap }));
  const untested = axes.filter((a) => a.current === null).map((a) => a.label);
  return {
    stream: stream ? stream.name : null,
    axes,
    priorities,
    untested,
    coverage: Math.round((measured.length / axes.length) * 100),
    skills: { resume: resumeSkills, missingForJd: jdMissing }
  };
}

function digitalTwin(turns, { mistakes = [], sessions = 0 } = {}) {
  const evals = turns.filter((t) => t.evaluation);
  if (evals.length < 2) {
    return { ready: false, sampleSize: evals.length, message: 'Complete at least one interview so your twin has something to learn from.' };
  }
  const e = evals.map((t) => t.evaluation);
  const wpmList = e.map((x) => x.timing && x.timing.wpm).filter(Boolean);
  const thinkList = e.map((x) => x.timing && x.timing.thinkSec).filter((v) => typeof v === 'number' && v > 0);
  const words = e.map((x) => (x.stats ? x.stats.words : 0));
  const starApplicable = e.filter((x) => x.star && x.star.applicable);
  const quantifiedRatio = starApplicable.length ? starApplicable.filter((x) => x.star.quantified).length / starApplicable.length : null;

  const delivery = {
    avgWords: Math.round(mean(words)),
    wpm: wpmList.length ? Math.round(mean(wpmList)) : null,
    thinkSec: thinkList.length ? round(mean(thinkList)) : null,
    fillersPer100: round(mean(e.map((x) => (x.fillers ? x.fillers.perHundred : 0)))),
    hedgesPerAnswer: round(mean(e.map((x) => (x.stats ? x.stats.hedges : 0)))),
    quantifiesResults: quantifiedRatio === null ? null : Math.round(quantifiedRatio * 100),
    starScore: starApplicable.length ? Math.round(mean(starApplicable.map((x) => x.star.score))) : null
  };
  const comps = competencyStats(turns).filter((c) => c.n > 0);
  const sorted = [...comps].sort((a, b) => b.mean - a.mean);
  const consistency = clamp(Math.round(100 - stddev(e.map((x) => x.overall)) * 22));
  const stressTurns = turns.filter((t) => t.stress && t.evaluation);
  const calmTurns = turns.filter((t) => !t.stress && t.evaluation);
  const stressDelta = stressTurns.length && calmTurns.length ? round(mean(stressTurns.map((t) => t.evaluation.overall)) - mean(calmTurns.map((t) => t.evaluation.overall))) : null;

  const archetype = pickArchetype(delivery, consistency);
  const active = mistakes.filter((m) => !m.resolved).sort((a, b) => b.count - a.count);

  const portrait = [
    `Across ${evals.length} answers${sessions ? ` in ${sessions} interview${sessions > 1 ? 's' : ''}` : ''}, you come across as ${archetype.description}`,
    sorted.length ? `You're strongest in ${sorted[0].label.toLowerCase()} (${sorted[0].mean}/100)` + (sorted.length > 1 ? ` and weakest in ${sorted[sorted.length - 1].label.toLowerCase()} (${sorted[sorted.length - 1].mean}/100).` : '.') : '',
    active.length ? `The habit most likely to cost you marks right now: ${active[0].label.toLowerCase()}.` : 'No recurring mistakes on record — keep it that way.',
    stressDelta !== null ? (stressDelta < -0.8 ? `Under pressure your scores drop by about ${Math.abs(stressDelta)} points.` : 'Pressure barely moves your scores.') : ''
  ]
    .filter(Boolean)
    .join(' ');

  const predictions = comps.map((c) => ({
    id: c.id,
    label: c.label,
    atLevel3: simulateScore(c, 3),
    atLevel5: simulateScore(c, 5)
  }));

  return {
    ready: true,
    sampleSize: evals.length,
    archetype,
    portrait,
    delivery,
    consistency,
    stressDelta,
    strengths: sorted.slice(0, 2).map((c) => c.label),
    risks: sorted.slice(-2).reverse().map((c) => c.label),
    predictions,
    habits: active.slice(0, 3).map((m) => ({ code: m.code, label: m.label, count: m.count }))
  };
}

function simulateScore(comp, difficulty) {
  if (comp.mean === null) return null;
  const base = comp.mean;
  const diffShift = (difficulty - (comp.avgDifficulty || 2.5)) * 6;
  const confidence = Math.min(1, comp.n / 5);
  // Shrink toward 60 when we have little evidence.
  return Math.round(clamp((base - diffShift) * confidence + 60 * (1 - confidence)));
}

function pickArchetype(d, consistency) {
  if (d.avgWords > 170) return { id: 'explainer', name: 'The Thorough Explainer', description: 'detailed and knowledgeable, but at risk of losing the interviewer in long answers.' };
  if (d.avgWords < 45) return { id: 'minimalist', name: 'The Minimalist', description: 'concise to a fault — answers often stop before the interesting part.' };
  if (d.thinkSec !== null && d.thinkSec < 2.5) return { id: 'sprinter', name: 'The Quick Starter', description: 'quick off the mark, sometimes before the answer is fully planned.' };
  if (d.fillersPer100 > 4) return { id: 'thinker-aloud', name: 'The Thinker-Aloud', description: 'someone who reasons in real time — with fillers marking the thinking.' };
  if (d.starScore !== null && d.starScore >= 70) return { id: 'storyteller', name: 'The Storyteller', description: 'a clear storyteller who structures experiences well.' };
  if (consistency >= 80) return { id: 'steady', name: 'The Steady Performer', description: 'reliable and even — few highs or lows between answers.' };
  return { id: 'developing', name: 'The Developing All-rounder', description: 'balanced, with no single habit dominating yet.' };
}

/**
 * Weakness-to-Question Engine — choose the next bank question that best targets
 * the candidate's weakest measured competency, at roughly the requested level.
 */
function pickWeaknessQuestion({ streamId, turns, difficulty = 2, exclude = new Set(), mistakes = [] }) {
  const comps = competencyStats(turns).filter((c) => c.n > 0).sort((a, b) => a.mean - b.mean);
  const pool = allQuestionsFor(streamId).filter((q) => !exclude.has(q.id));
  if (!pool.length) return null;
  const mistakeCodes = new Set(mistakes.filter((m) => !m.resolved).map((m) => m.code));
  const wantsBehavioural = mistakeCodes.has('missing-structure') || mistakeCodes.has('no-quantified-result') || mistakeCodes.has('we-not-i');

  for (const comp of comps.slice(0, 3)) {
    const candidates = pool.filter((q) => q.competency === comp.id);
    if (candidates.length) {
      const best = closestDifficulty(candidates, difficulty);
      return { question: best, reason: `Targets ${comp.label.toLowerCase()} — your lowest area (${comp.mean}/100).`, competency: comp.id };
    }
  }
  if (wantsBehavioural) {
    const b = pool.filter((q) => q.type === 'behavioral');
    if (b.length) return { question: closestDifficulty(b, difficulty), reason: 'Practises story structure — a recurring mistake.', competency: 'communication' };
  }
  return null;
}

function closestDifficulty(list, difficulty) {
  return [...list].sort((a, b) => Math.abs(a.difficulty - difficulty) - Math.abs(b.difficulty - difficulty) || Math.random() - 0.5)[0];
}

module.exports = { competencyStats, skillGapMap, digitalTwin, pickWeaknessQuestion, closestDifficulty, DEFAULT_TARGET, simulateScore };
