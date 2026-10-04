'use strict';
const gemini = require('./ai/gemini');
const ml = require('./mlClient');
const { readiness, predictOutcome, outcomeFeatures } = require('./engines/scoring');
const { competencyStats, skillGapMap } = require('./engines/profile');
const { analyzePresentation } = require('./engines/presentation');
const { averageScores } = require('./engines/evaluator');
const { detectMistakes, CATALOG } = require('./engines/mistakeMemory');
const { summarize: summarizeTruth } = require('./engines/resumeTruth');
const { getPersona } = require('./ai/interviewer');
const { mean, round } = require('../utils/text');

function slimEvaluation(e) {
  if (!e) return null;
  return {
    source: e.source,
    overall: e.overall,
    scores: e.scores,
    stats: e.stats,
    fillers: e.fillers ? { total: e.fillers.total, perHundred: e.fillers.perHundred, level: e.fillers.level, top: e.fillers.top, heatmap: e.fillers.heatmap, hotspot: e.fillers.hotspot, marks: e.fillers.marks } : null,
    star: e.star,
    gaps: e.gaps,
    timing: e.timing,
    feedback: e.feedback,
    modelAnswer: e.modelAnswer
  };
}

async function buildReport(session, { user, historyTurns = [], samples = [] }) {
  const answered = session.turns.filter((t) => t.evaluation && !t.skipped);
  const evals = answered.map((t) => t.evaluation);
  const persona = getPersona(session.persona, session.stress);

  const sessionReadiness = readiness(evals, { includePractice: false });
  const truthClaims = (user.resume && user.resume.claims ? user.resume.claims : []).filter((c) => answered.some((t) => t.claimId === c.id) && c.assessment && c.assessment.status);
  const truth = truthClaims.length ? { ...summarizeTruth(truthClaims), claims: truthClaims.map((c) => ({ id: c.id, type: c.type, keyword: c.keyword, assessment: c.assessment })) } : null;

  const features = outcomeFeatures(evals, { credibility: truth ? truth.credibility : null });
  const mlOutcome = evals.length ? await ml.predictOutcome(features) : null;
  const outcome = evals.length ? (mlOutcome && typeof mlOutcome.probability === 'number' ? mlOutcome : predictOutcome(features)) : null;

  // Filler heatmap matrix: rows = answers, cols = slices of each answer.
  const fillerRows = answered.map((t) => ({ index: t.index, label: t.kind === 'follow-up' ? 'Follow-up' : `Q${answered.filter((x) => x.kind === 'main' && x.index <= t.index).length}`, heatmap: t.evaluation.fillers ? t.evaluation.fillers.heatmap : [], perHundred: t.evaluation.fillers ? t.evaluation.fillers.perHundred : 0 }));
  const fillerWords = {};
  for (const e of evals) for (const [w, c] of Object.entries((e.fillers && e.fillers.byWord) || {})) fillerWords[w] = (fillerWords[w] || 0) + c;

  const starApplicable = evals.filter((e) => e.star && e.star.applicable);
  const starSummary = starApplicable.length
    ? {
        average: Math.round(mean(starApplicable.map((e) => e.star.score))),
        components: ['situation', 'task', 'action', 'result'].map((c) => ({ key: c, rate: Math.round((starApplicable.filter((e) => e.star.components[c].present).length / starApplicable.length) * 100) })),
        quantifiedRate: Math.round((starApplicable.filter((e) => e.star.quantified).length / starApplicable.length) * 100)
      }
    : null;

  const timingRows = answered.map((t) => ({ index: t.index, difficulty: t.difficulty, thinkSec: t.evaluation.timing.thinkSec, answerSec: t.evaluation.timing.answerSec, wpm: t.evaluation.timing.wpm, verdict: t.evaluation.timing.thinkVerdict, idealThink: t.evaluation.timing.idealThink }));
  const timing = {
    rows: timingRows,
    avgThink: round(mean(timingRows.map((r) => r.thinkSec))),
    avgAnswer: round(mean(timingRows.map((r) => r.answerSec))),
    avgWpm: timingRows.some((r) => r.wpm) ? Math.round(mean(timingRows.map((r) => r.wpm).filter(Boolean))) : null,
    notes: [...new Set(evals.flatMap((e) => e.timing.notes))].slice(0, 4)
  };

  const difficultyPath = session.turns
    .filter((t) => t.kind === 'main')
    .map((t) => ({ index: t.index, level: t.difficulty, change: t.difficultyChange ? t.difficultyChange.change : 0, reason: t.difficultyChange ? t.difficultyChange.reason : null, score: t.evaluation ? t.evaluation.overall : null }));

  const mistakeCounts = {};
  for (const t of answered) for (const m of detectMistakes(t.evaluation, { type: t.type, answer: t.answer || '' })) mistakeCounts[m.code] = (mistakeCounts[m.code] || 0) + 1;
  const mistakes = Object.entries(mistakeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, label: CATALOG[code].label, tip: CATALOG[code].tip }));

  let stressResilience = null;
  if (session.stress) {
    const calm = historyTurns.filter((t) => !t.stress);
    const calmAvg = calm.length ? mean(calm.map((t) => t.evaluation.overall)) : null;
    const stressAvg = mean(evals.map((e) => e.overall));
    stressResilience = {
      stressAverage: round(stressAvg),
      calmAverage: calmAvg === null ? null : round(calmAvg),
      delta: calmAvg === null ? null : round(stressAvg - calmAvg),
      score: calmAvg === null ? Math.round(stressAvg * 10) : Math.max(0, Math.min(100, Math.round(70 + (stressAvg - calmAvg) * 15))),
      followUpsHandled: session.turns.filter((t) => t.kind === 'follow-up' && t.evaluation && t.evaluation.overall >= 6).length
    };
  }

  const presentation = session.mode !== 'text' ? analyzePresentation(samples) : null;
  const overall = evals.length ? round(mean(evals.map((e) => e.overall))) : 0;
  const competencies = competencyStats(answered).filter((c) => c.n > 0);
  const skillGap = skillGapMap([...historyTurns, ...answered], session.stream);

  const report = {
    generatedAt: new Date(),
    overall,
    scores: averageScores(evals),
    answered: answered.length,
    skipped: session.turns.filter((t) => t.skipped).length,
    followUps: session.turns.filter((t) => t.kind === 'follow-up').length,
    readiness: sessionReadiness,
    outcome,
    competencies,
    fillers: {
      total: evals.reduce((a, e) => a + (e.fillers ? e.fillers.total : 0), 0),
      perHundred: round(mean(evals.map((e) => (e.fillers ? e.fillers.perHundred : 0)))),
      words: Object.entries(fillerWords).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count })),
      rows: fillerRows
    },
    star: starSummary,
    timing,
    difficultyPath,
    mistakes,
    truth,
    jd: session.jd && session.jd.match ? { score: session.jd.match.score, verdict: session.jd.match.verdict, matched: session.jd.match.matched, missing: session.jd.match.missing } : null,
    stress: stressResilience,
    presentation,
    skillGap,
    persona: { id: persona.id, name: persona.name, title: persona.title },
    summary: offlineSummary({ overall, sessionReadiness, mistakes, competencies, starSummary, timing, session })
  };

  if (gemini.isEnabled() && evals.length) {
    const qa = answered.slice(0, 10).map((t) => `Q: ${t.text}\nA: ${String(t.answer || '').slice(0, 600)}\nScore: ${t.evaluation.overall}/10`).join('\n\n');
    const data = await gemini.generateJson({
      system: 'You are an interview coach writing a short, honest, specific debrief. Respond only with JSON.',
      prompt: `Write a debrief for this ${session.mode} interview (${session.stream}, role ${session.role || 'graduate'}).\n${qa}\n\nReturn JSON {"summary": "3-4 sentences, second person, specific, no fluff", "nextSteps": ["3 concrete actions"]}`,
      temperature: 0.4,
      timeoutMs: 12000
    });
    if (data && typeof data.summary === 'string') {
      report.summary = { text: data.summary, nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps.filter((s) => typeof s === 'string').slice(0, 4) : report.summary.nextSteps, source: 'gemini' };
    }
  }
  return report;
}

function offlineSummary({ overall, sessionReadiness, mistakes, competencies, starSummary, timing }) {
  if (!competencies.length) return { text: 'No answers were recorded in this session.', nextSteps: ['Start a new interview and answer at least three questions.'], source: 'offline' };
  const sorted = [...competencies].sort((a, b) => b.mean - a.mean);
  const parts = [];
  parts.push(`You averaged ${overall}/10, which puts this session at a readiness of ${sessionReadiness.score}/100.`);
  parts.push(`Your best area was ${sorted[0].label.toLowerCase()}${sorted.length > 1 ? `, and ${sorted[sorted.length - 1].label.toLowerCase()} needs the most work` : ''}.`);
  if (mistakes.length) parts.push(`The pattern that cost you most: ${mistakes[0].label.toLowerCase()} (${mistakes[0].count}×).`);
  if (starSummary && starSummary.quantifiedRate < 50) parts.push('Most of your stories ended without a measurable result.');
  const nextSteps = [];
  if (mistakes[0]) nextSteps.push(mistakes[0].tip);
  if (sorted.length > 1) nextSteps.push(`Run a session with "Focus on weak areas" on to practise ${sorted[sorted.length - 1].label.toLowerCase()}.`);
  if (timing.notes[0]) nextSteps.push(timing.notes[0]);
  if (nextSteps.length < 3) nextSteps.push('Try the A/B Lab: rewrite your weakest answer and compare the two versions.');
  return { text: parts.join(' '), nextSteps: nextSteps.slice(0, 3), source: 'offline' };
}

module.exports = { buildReport, slimEvaluation };
