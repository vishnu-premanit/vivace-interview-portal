'use strict';
const Interview = require('../models/Interview');
const Mistake = require('../models/Mistake');
const { detectMistakes, RESOLVE_AFTER } = require('./engines/mistakeMemory');

/** Flatten answered turns across a user's interviews (newest sessions last). */
async function answeredTurns(userId, { sessionLimit = 30, excludeId = null } = {}) {
  const query = { user: userId, status: { $in: ['completed', 'active'] } };
  if (excludeId) query._id = { $ne: excludeId };
  const sessions = await Interview.find(query).sort({ createdAt: -1 }).limit(sessionLimit).select('turns stress mode stream createdAt status').lean();
  const turns = [];
  for (const s of sessions.reverse()) {
    for (const t of s.turns || []) {
      if (t.evaluation && !t.skipped) {
        turns.push({ ...t, stress: s.stress, mode: s.mode, sessionId: s._id, at: t.answeredAt || s.createdAt });
      }
    }
  }
  return { turns, sessions };
}

async function recentQuestionIds(userId, sessions = 3) {
  const recent = await Interview.find({ user: userId }).sort({ createdAt: -1 }).limit(sessions).select('turns.questionId').lean();
  return recent.flatMap((s) => (s.turns || []).map((t) => t.questionId)).filter(Boolean);
}

async function getMistakes(userId) {
  return Mistake.find({ user: userId }).sort({ resolved: 1, count: -1, lastSeen: -1 }).lean();
}

/** Mistake Memory: record what this answer did wrong, and credit clean answers. */
async function recordMistakes(userId, evaluation, { type, answer }) {
  const found = detectMistakes(evaluation, { type, answer });
  const now = new Date();
  const foundCodes = new Set(found.map((f) => f.code));
  for (const f of found) {
    await Mistake.findOneAndUpdate(
      { user: userId, code: f.code },
      {
        $inc: { count: 1 },
        $set: { label: f.label, tip: f.tip, lastSeen: now, cleanStreak: 0, resolved: false, resolvedAt: null },
        $setOnInsert: { firstSeen: now },
        ...(f.detail ? { $push: { details: { $each: [String(f.detail).slice(0, 120)], $slice: -5 } } } : {})
      },
      { upsert: true, new: true }
    );
  }
  // Only credit a clean answer for habits this answer could actually have shown.
  const notApplicable = new Set();
  if (type === 'technical') ['no-quantified-result', 'missing-structure', 'we-not-i'].forEach((c) => notApplicable.add(c));
  if (!evaluation.timing || !evaluation.timing.paceVerdict) notApplicable.add('pace-fast');
  if (!evaluation.timing || !evaluation.timing.thinkSec) ['slow-start', 'rushed-start'].forEach((c) => notApplicable.add(c));
  const active = await Mistake.find({ user: userId, resolved: false, code: { $nin: [...foundCodes, ...notApplicable] } });
  for (const m of active) {
    m.cleanStreak += 1;
    if (m.cleanStreak >= RESOLVE_AFTER) {
      m.resolved = true;
      m.resolvedAt = now;
    }
    await m.save();
  }
  return found;
}

module.exports = { answeredTurns, recentQuestionIds, getMistakes, recordMistakes };
