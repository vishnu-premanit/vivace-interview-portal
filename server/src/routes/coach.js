'use strict';
const express = require('express');
const { z } = require('zod');
const CoachMessage = require('../models/CoachMessage');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { aiLimiter } = require('../middleware/security');
const { asyncHandler } = require('../utils/httpError');
const gemini = require('../services/ai/gemini');
const { coachReply, detectIntent } = require('../services/engines/coach');
const { answeredTurns, getMistakes } = require('../services/history');
const { digitalTwin, skillGapMap } = require('../services/engines/profile');
const { readiness } = require('../services/engines/scoring');
const { summarize } = require('../services/engines/resumeTruth');
const { getStream } = require('../services/data/streams');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const messages = await CoachMessage.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(60).lean();
    res.json({ messages: messages.reverse().map((m) => ({ id: m._id.toString(), role: m.role, text: m.text, createdAt: m.createdAt, source: m.source })) });
  })
);

router.delete(
  '/history',
  asyncHandler(async (req, res) => {
    await CoachMessage.deleteMany({ user: req.user._id });
    res.json({ ok: true });
  })
);

const messageSchema = z.object({ message: z.string().trim().min(1, 'Type a message').max(2000) });

router.post(
  '/',
  aiLimiter,
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    const user = req.user;
    const { turns, sessions } = await answeredTurns(user._id);
    const mistakes = await getMistakes(user._id);
    const completed = sessions.filter((s) => s.status === 'completed').length;
    const ctx = {
      name: user.name,
      twin: digitalTwin(turns, { mistakes, sessions: completed }),
      mistakes,
      skillGap: skillGapMap(turns, user.stream),
      readiness: readiness(turns.map((t) => t.evaluation).slice(-40), { sessions: completed, activeMistakes: mistakes.filter((m) => !m.resolved) }),
      truth: user.resume && user.resume.claims && user.resume.claims.length ? summarize(user.resume.claims) : null
    };
    await CoachMessage.create({ user: user._id, role: 'user', text: req.body.message });

    let reply = null;
    let source = 'offline';
    if (gemini.isEnabled()) {
      const history = await CoachMessage.find({ user: user._id }).sort({ createdAt: -1 }).skip(1).limit(10).lean();
      const stream = getStream(user.stream);
      const facts = [
        `Name: ${user.name}. Stream: ${stream ? stream.full : user.stream}. Target role: ${user.targetRole || 'not set'}.`,
        ctx.readiness.sampleSize ? `Readiness score ${ctx.readiness.score}/100 (${ctx.readiness.band}).` : 'No interviews completed yet.',
        ctx.twin.ready ? `Digital twin: ${ctx.twin.portrait}` : '',
        mistakes.filter((m) => !m.resolved).length ? `Recurring mistakes: ${mistakes.filter((m) => !m.resolved).slice(0, 4).map((m) => `${m.label} (${m.count}x)`).join('; ')}.` : '',
        ctx.skillGap.priorities.length ? `Biggest skill gaps: ${ctx.skillGap.priorities.map((p) => `${p.label} -${p.gap}`).join(', ')}.` : ''
      ]
        .filter(Boolean)
        .join('\n');
      reply = await gemini.generateText({
        system: `You are Vivace's personal interview coach for Indian college students and graduates. Be warm, direct and practical. Use the candidate's data below; never invent scores. Keep replies under 180 words, plain text, short paragraphs or a short list. Do not claim to be human.\n\nCandidate data:\n${facts}`,
        prompt: req.body.message,
        history: history.reverse().map((m) => ({ role: m.role, text: m.text }))
      });
      if (reply) source = 'gemini';
    }
    const offline = coachReply(req.body.message, ctx);
    if (!reply) reply = offline.reply;
    const saved = await CoachMessage.create({ user: user._id, role: 'coach', text: reply, intent: detectIntent(req.body.message), source });
    res.json({ message: { id: saved._id.toString(), role: 'coach', text: reply, createdAt: saved.createdAt, source } });
  })
);

module.exports = { router };
