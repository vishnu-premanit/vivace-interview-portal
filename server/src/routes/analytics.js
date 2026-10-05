'use strict';
const express = require('express');
const { z } = require('zod');
const Interview = require('../models/Interview');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/httpError');
const ml = require('../services/mlClient');
const { answeredTurns, getMistakes } = require('../services/history');
const { readiness, predictOutcome, outcomeFeatures } = require('../services/engines/scoring');
const { skillGapMap, digitalTwin, competencyStats, simulateScore } = require('../services/engines/profile');
const { summarize: summarizeTruth } = require('../services/engines/resumeTruth');
const { COMPETENCIES } = require('../services/data/streams');
const { mean, round } = require('../utils/text');

const router = express.Router();
router.use(requireAuth);

async function loadProfile(user) {
  const { turns, sessions } = await answeredTurns(user._id, { sessionLimit: 40 });
  const mistakes = await getMistakes(user._id);
  const completed = sessions.filter((s) => s.status === 'completed');
  const evals = turns.map((t) => t.evaluation);
  const active = mistakes.filter((m) => !m.resolved);
  const claims = (user.resume && user.resume.claims) || [];
  const truth = claims.length ? summarizeTruth(claims) : null;
  return { turns, sessions, completed, evals, mistakes, active, truth };
}

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const user = req.user;
    const p = await loadProfile(user);
    const recentEvals = p.evals.slice(-40);
    const ready = readiness(recentEvals, { sessions: p.completed.length, activeMistakes: p.active });
    let outcome = null;
    if (recentEvals.length) {
      const features = outcomeFeatures(recentEvals, { credibility: p.truth ? p.truth.credibility : null });
      const mlOut = await ml.predictOutcome(features);
      outcome = mlOut && typeof mlOut.probability === 'number' ? mlOut : predictOutcome(features);
    }

    // Trend: one point per completed session.
    const sessionDocs = await Interview.find({ user: user._id, status: 'completed' }).sort({ createdAt: 1 }).limit(30).select('createdAt mode stress report.overall report.readiness.score report.fillers.perHundred').lean();
    const trend = sessionDocs.map((s) => ({
      id: s._id.toString(),
      date: s.createdAt,
      mode: s.mode,
      stress: s.stress,
      overall: s.report ? s.report.overall : null,
      readiness: s.report && s.report.readiness ? s.report.readiness.score : null,
      fillers: s.report && s.report.fillers ? s.report.fillers.perHundred : null
    }));

    const byMode = ['text', 'voice', 'video'].map((m) => {
      const t = p.turns.filter((x) => x.mode === m);
      return { mode: m, answers: t.length, average: t.length ? round(mean(t.map((x) => x.evaluation.overall))) : null };
    });

    res.json({
      readiness: ready,
      outcome,
      skillGap: skillGapMap(p.turns, user.stream, { resumeSkills: (user.resume && user.resume.skills) || [], jdMissing: (user.lastJd && user.lastJd.match && user.lastJd.match.missing) || [] }),
      mistakes: {
        active: p.active.map((m) => ({ code: m.code, label: m.label, tip: m.tip, count: m.count, lastSeen: m.lastSeen, cleanStreak: m.cleanStreak, details: m.details })),
        resolved: p.mistakes.filter((m) => m.resolved).map((m) => ({ code: m.code, label: m.label, count: m.count, resolvedAt: m.resolvedAt }))
      },
      trend,
      byMode,
      truth: p.truth,
      totals: {
        sessions: p.sessions.length,
        completed: p.completed.length,
        answers: p.turns.length,
        averageScore: p.evals.length ? round(mean(p.evals.map((e) => e.overall))) : null,
        minutesPractised: Math.round(p.turns.reduce((a, t) => a + ((t.metrics && t.metrics.answerDurationMs) || 0), 0) / 60000)
      }
    });
  })
);

router.get(
  '/twin',
  asyncHandler(async (req, res) => {
    const p = await loadProfile(req.user);
    res.json({ twin: digitalTwin(p.turns, { mistakes: p.mistakes, sessions: p.completed.length }), competencies: competencyStats(p.turns) });
  })
);

const simulateSchema = z.object({
  competency: z.enum(COMPETENCIES.map((c) => c.id)),
  difficulty: z.number().int().min(1).max(5),
  stress: z.boolean().optional().default(false)
});

router.post(
  '/twin/simulate',
  validate(simulateSchema),
  asyncHandler(async (req, res) => {
    const p = await loadProfile(req.user);
    const comp = competencyStats(p.turns).find((c) => c.id === req.body.competency);
    const twin = digitalTwin(p.turns, { mistakes: p.mistakes, sessions: p.completed.length });
    let predicted = simulateScore(comp, req.body.difficulty);
    if (predicted !== null && req.body.stress && twin.ready && twin.stressDelta !== null) predicted = Math.max(0, Math.min(100, Math.round(predicted + twin.stressDelta * 10)));
    else if (predicted !== null && req.body.stress) predicted = Math.max(0, predicted - 6);
    const pitfalls = p.active.slice(0, 3).map((m) => m.label);
    res.json({
      competency: comp.label,
      difficulty: req.body.difficulty,
      stress: req.body.stress,
      predicted,
      confidence: comp.n >= 5 ? 'high' : comp.n >= 2 ? 'medium' : comp.n === 1 ? 'low' : 'none',
      evidence: comp.n,
      pitfalls,
      note: predicted === null ? 'Your twin has not seen you answer this kind of question yet. Run an interview to teach it.' : null
    });
  })
);

module.exports = { router };
