'use strict';
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const Interview = require('../models/Interview');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { aiLimiter, uploadLimiter } = require('../middleware/security');
const { HttpError, asyncHandler } = require('../utils/httpError');
const env = require('../config/env');
const db = require('../db/mongo');
const interviewer = require('../services/ai/interviewer');
const gemini = require('../services/ai/gemini');
const { answeredTurns, recentQuestionIds, getMistakes, recordMistakes } = require('../services/history');
const { nextDifficulty } = require('../services/engines/difficulty');
const { matchResume } = require('../services/engines/jdMatch');
const { assessClaim } = require('../services/engines/resumeTruth');
const { buildReport, slimEvaluation } = require('../services/report');
const { STREAMS, PERSONAS, LANGUAGES } = require('../services/data/streams');

const router = express.Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createSchema = z.object({
  mode: z.enum(['text', 'voice', 'video']),
  stream: z.enum(STREAMS.map((s) => s.id)),
  role: z.string().trim().max(100).optional().default(''),
  persona: z.enum(PERSONAS.map((p) => p.id)).optional().default('mentor'),
  language: z.enum(LANGUAGES.map((l) => l.code)).optional().default('en'),
  stress: z.boolean().optional().default(false),
  difficulty: z.number().int().min(1).max(5).optional().default(2),
  questionCount: z.number().int().min(3).max(12).optional().default(6),
  focusWeaknesses: z.boolean().optional().default(false),
  useResume: z.boolean().optional().default(false),
  jdText: z.string().trim().max(20000).optional().default('')
});

const answerSchema = z.object({
  answer: z.string().max(12000).optional().default(''),
  skip: z.boolean().optional().default(false),
  thinkTimeMs: z.number().min(0).max(3_600_000).optional().default(0),
  answerDurationMs: z.number().min(0).max(3_600_000).optional().default(0),
  inputMode: z.enum(['typed', 'speech', 'transcribed']).optional().default('typed')
});

const sampleSchema = z.object({
  brightness: z.number().min(0).max(255).optional(),
  presence: z.number().min(0).max(1).optional(),
  centred: z.number().min(0).max(1).optional(),
  motion: z.number().min(0).max(1).optional(),
  voiceActivity: z.number().min(0).max(1).optional(),
  volumeVariation: z.number().min(0).max(1).optional(),
  longPauses: z.number().int().min(0).max(1000).optional()
});
const presentationSchema = z.object({ samples: z.array(sampleSchema).min(1).max(120) });

function pendingTurn(session) {
  for (let i = session.turns.length - 1; i >= 0; i--) {
    if (!session.turns[i].answeredAt) return session.turns[i];
  }
  return null;
}

function publicTurn(t, { withEvaluation = true } = {}) {
  return {
    index: t.index,
    kind: t.kind,
    parent: t.parent,
    text: t.text,
    competency: t.competency,
    type: t.type,
    difficulty: t.difficulty,
    source: t.source,
    counterReason: t.counterReason || null,
    targetReason: t.targetReason || null,
    untranslated: Boolean(t.untranslated),
    answer: t.answer || null,
    skipped: Boolean(t.skipped),
    answered: Boolean(t.answeredAt),
    hasAudio: Boolean(t.audioFileId),
    evaluation: withEvaluation ? slimEvaluation(t.evaluation) : undefined
  };
}

function view(session, user) {
  const persona = interviewer.getPersona(session.persona, session.stress);
  const lang = LANGUAGES.find((l) => l.code === session.language) || LANGUAGES[0];
  const stream = STREAMS.find((s) => s.id === session.stream);
  const current = pendingTurn(session);
  return {
    id: session._id.toString(),
    mode: session.mode,
    stream: { id: session.stream, name: stream ? stream.name : session.stream },
    role: session.role,
    persona,
    language: lang,
    stress: session.stress,
    focusWeaknesses: session.focusWeaknesses,
    useResume: session.useResume,
    status: session.status,
    difficulty: session.difficulty,
    difficultyStart: session.difficultyStart,
    questionCount: session.questionCount,
    mainAsked: session.turns.filter((t) => t.kind === 'main').length,
    timeLimitSec: interviewer.timeLimitFor(session.mode, session.stress),
    greeting: user ? interviewer.greeting(session, user.name) : '',
    reminders: session.reminders || [],
    turns: session.turns.map((t) => publicTurn(t)),
    current: current ? publicTurn(current, { withEvaluation: false }) : null,
    hasRecording: Boolean(session.recording && session.recording.fileId),
    recording: session.recording && session.recording.fileId ? { id: session.recording.fileId.toString(), mime: session.recording.mime, size: session.recording.size } : null,
    aiSource: session.aiSource,
    report: session.report || null,
    createdAt: session.createdAt,
    completedAt: session.completedAt || null
  };
}

async function loadOwned(id, userId, select) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(404, 'Interview not found.');
  const q = Interview.findOne({ _id: id, user: userId });
  if (select) q.select(select);
  const session = await q;
  if (!session) throw new HttpError(404, 'Interview not found.');
  return session;
}

router.post(
  '/',
  aiLimiter,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const user = await User.findById(req.user._id).select('+resume.text');
    const { turns: history } = await answeredTurns(user._id);
    const mistakes = await getMistakes(user._id);
    const hasResume = Boolean(body.useResume && user.resume && user.resume.claims && user.resume.claims.length);

    let jd = null;
    if (body.jdText && body.jdText.length >= 40) {
      const match = matchResume(body.jdText, (user.resume && user.resume.text) || '', user.resume && user.resume.skills && user.resume.skills.length ? user.resume.skills : null);
      jd = { text: body.jdText, match };
      user.lastJd = { text: body.jdText, match, at: new Date() };
      await user.save();
    }

    const session = new Interview({
      user: user._id,
      mode: body.mode,
      stream: body.stream,
      role: body.role,
      persona: body.stress ? 'skeptic' : body.persona,
      language: body.language,
      stress: body.stress,
      focusWeaknesses: body.focusWeaknesses,
      useResume: hasResume,
      difficultyStart: body.difficulty,
      difficulty: body.difficulty,
      questionCount: body.questionCount,
      jd,
      plan: interviewer.buildPlan({ questionCount: body.questionCount, streamId: body.stream, hasResume, hasJd: Boolean(jd), focusWeaknesses: body.focusWeaknesses, hasHistory: history.length > 0 }),
      reminders: mistakes
        .filter((m) => !m.resolved)
        .slice(0, 3)
        .map((m) => ({ code: m.code, label: m.label, tip: m.tip, count: m.count })),
      aiSource: gemini.isEnabled() ? 'gemini' : 'offline'
    });

    const first = await interviewer.nextQuestion(session, {
      history,
      mistakes,
      resumeClaims: hasResume ? user.resume.claims : [],
      jdMatch: jd ? jd.match : null,
      recentIds: await recentQuestionIds(user._id)
    });
    session.turns.push({ ...first, index: 0, askedAt: new Date() });
    await session.save();
    res.status(201).json({ interview: view(session, user) });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = ['active', 'completed', 'abandoned'].includes(req.query.status) ? req.query.status : null;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const query = { user: req.user._id };
    if (status) query.status = status;
    const list = await Interview.find(query).sort({ createdAt: -1 }).limit(limit).select('mode stream role persona language stress status difficulty difficultyStart questionCount createdAt completedAt report.overall report.readiness.score report.outcome.probability turns.kind turns.answeredAt').lean();
    res.json({
      interviews: list.map((s) => ({
        id: s._id.toString(),
        mode: s.mode,
        stream: s.stream,
        streamName: (STREAMS.find((x) => x.id === s.stream) || {}).name || s.stream,
        role: s.role,
        persona: s.persona,
        language: s.language,
        stress: s.stress,
        status: s.status,
        questionCount: s.questionCount,
        answered: (s.turns || []).filter((t) => t.answeredAt).length,
        overall: s.report ? s.report.overall : null,
        readiness: s.report && s.report.readiness ? s.report.readiness.score : null,
        outcome: s.report && s.report.outcome ? s.report.outcome.probability : null,
        createdAt: s.createdAt,
        completedAt: s.completedAt || null
      }))
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await loadOwned(req.params.id, req.user._id);
    res.json({ interview: view(session, req.user) });
  })
);

router.post(
  '/:id/answer',
  aiLimiter,
  validate(answerSchema),
  asyncHandler(async (req, res) => {
    const session = await loadOwned(req.params.id, req.user._id);
    if (session.status !== 'active') throw new HttpError(409, 'This interview has already finished.');
    const turn = pendingTurn(session);
    if (!turn) throw new HttpError(409, 'There is no open question to answer.');
    const { answer, skip, thinkTimeMs, answerDurationMs, inputMode } = req.body;
    const text = answer.trim();
    if (!skip && text.length < 2) throw new HttpError(400, 'Your answer is empty. Type or say something, or skip the question.');

    const user = await User.findById(req.user._id);
    turn.answer = skip ? '' : text;
    turn.skipped = skip;
    turn.answeredAt = new Date();
    turn.metrics = { thinkTimeMs, answerDurationMs, inputMode };

    let evaluation = null;
    let counter = null;
    if (!skip) {
      evaluation = await interviewer.evaluate({ turn, answer: text, metrics: { thinkTimeMs, answerDurationMs }, session });
      turn.evaluation = evaluation;
      await recordMistakes(user._id, evaluation, { type: turn.type, answer: text });

      // Resume Truth Checker: score how well this answer backs up the claim.
      if (turn.claimId && user.resume && user.resume.claims) {
        const claim = user.resume.claims.find((c) => c.id === turn.claimId);
        if (claim) {
          const assessment = assessClaim(claim, text);
          const prev = claim.assessment && typeof claim.assessment.score === 'number' ? claim.assessment.score : null;
          claim.assessment = { ...assessment, score: prev ? Math.round((prev + assessment.score) / 2) : assessment.score, at: new Date() };
          user.markModified('resume.claims');
          await user.save();
        }
      }

      const parentIndex = turn.kind === 'main' ? turn.index : turn.parent;
      const parent = session.turns.find((t) => t.index === parentIndex);
      const followUpsSoFar = session.turns.filter((t) => t.kind === 'follow-up' && t.parent === parentIndex).length;
      counter = await interviewer.counterQuestion({
        session,
        parentTurn: parent,
        answer: text,
        evaluation,
        followUpsSoFar,
        resumeClaims: session.useResume && user.resume ? user.resume.claims : []
      });
      if (counter) {
        session.turns.push({ ...counter, index: session.turns.length, parent: parentIndex, askedAt: new Date() });
      }
    }

    let next = counter ? session.turns[session.turns.length - 1] : null;
    let difficultyChange = null;
    let done = false;
    if (!counter) {
      const mainAsked = session.turns.filter((t) => t.kind === 'main').length;
      if (mainAsked >= session.questionCount) {
        done = true;
      } else {
        const scores = session.turns.filter((t) => t.evaluation || t.skipped).map((t) => (t.skipped ? 2 : t.evaluation.overall));
        difficultyChange = nextDifficulty({ current: session.difficulty, recentScores: scores, stress: session.stress });
        session.difficulty = difficultyChange.level;
        const { turns: history } = await answeredTurns(user._id, { excludeId: session._id });
        const mistakes = await getMistakes(user._id);
        const q = await interviewer.nextQuestion(session, {
          history,
          mistakes,
          resumeClaims: session.useResume && user.resume ? user.resume.claims : [],
          jdMatch: session.jd ? session.jd.match : null,
          recentIds: await recentQuestionIds(user._id)
        });
        session.turns.push({ ...q, index: session.turns.length, askedAt: new Date(), difficultyChange });
        next = session.turns[session.turns.length - 1];
      }
    }
    session.markModified('turns');
    await session.save();

    res.json({
      evaluation: slimEvaluation(evaluation),
      next: next ? publicTurn(next, { withEvaluation: false }) : null,
      transition: next && next.kind === 'main' ? interviewer.transition(session, session.turns.length) : '',
      difficulty: difficultyChange,
      done,
      closing: done ? interviewer.closing(session) : null,
      progress: { mainAsked: session.turns.filter((t) => t.kind === 'main').length, questionCount: session.questionCount }
    });
  })
);

const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

router.post(
  '/:id/transcribe',
  aiLimiter,
  audioUpload.single('audio'),
  asyncHandler(async (req, res) => {
    const session = await loadOwned(req.params.id, req.user._id, 'language status user');
    if (!req.file) throw new HttpError(400, 'No audio received.');
    if (!/^audio\/|^video\/webm/.test(req.file.mimetype)) throw new HttpError(415, 'Unsupported audio format.');
    if (!gemini.isEnabled()) {
      return res.status(503).json({ error: 'Server-side transcription needs a Gemini API key. Your browser speech recognition or typing still works.', text: null });
    }
    const text = await gemini.transcribe(req.file.buffer, req.file.mimetype.split(';')[0], session.language);
    if (!text) return res.status(502).json({ error: 'Could not transcribe that recording. Please type your answer.', text: null });
    res.json({ text });
  })
);

router.post(
  '/:id/presentation',
  validate(presentationSchema),
  asyncHandler(async (req, res) => {
    const session = await loadOwned(req.params.id, req.user._id, 'status mode user');
    if (session.mode === 'text') throw new HttpError(400, 'Presentation analysis only applies to voice and video interviews.');
    await Interview.updateOne({ _id: session._id }, { $push: { presentationSamples: { $each: req.body.samples, $slice: -600 } } });
    res.json({ ok: true });
  })
);

const recordingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 } });

router.post(
  '/:id/recording',
  uploadLimiter,
  recordingUpload.single('recording'),
  asyncHandler(async (req, res) => {
    const session = await loadOwned(req.params.id, req.user._id);
    if (session.mode === 'text') throw new HttpError(400, 'Text interviews have no recording.');
    if (!req.file) throw new HttpError(400, 'No recording received.');
    const mime = req.file.mimetype.split(';')[0];
    if (!/^(video|audio)\/(webm|mp4|ogg|mpeg|x-matroska)$/.test(mime)) throw new HttpError(415, 'Unsupported recording format.');
    if (session.recording && session.recording.fileId) await db.deleteFile(session.recording.fileId);
    const fileId = await db.saveBuffer(req.file.buffer, `interview-${session._id}.${mime.split('/')[1]}`, mime, { user: req.user._id.toString(), kind: 'recording', interview: session._id.toString() });
    session.recording = { fileId, mime, size: req.file.size };
    await session.save();
    res.status(201).json({ recording: { id: fileId.toString(), mime, size: req.file.size } });
  })
);

router.post(
  '/:id/finish',
  asyncHandler(async (req, res) => {
    const session = await Interview.findOne({ _id: req.params.id, user: req.user._id }).select('+presentationSamples');
    if (!session) throw new HttpError(404, 'Interview not found.');
    if (session.status === 'completed' && session.report) return res.json({ interview: view(session, req.user) });
    const answered = session.turns.filter((t) => t.evaluation && !t.skipped);
    if (!answered.length) {
      session.status = 'abandoned';
      session.completedAt = new Date();
      await session.save();
      return res.json({ interview: view(session, req.user), abandoned: true });
    }
    // Close any open question so the transcript is tidy.
    const open = pendingTurn(session);
    if (open) {
      open.skipped = true;
      open.answeredAt = new Date();
      open.answer = '';
    }
    const user = await User.findById(req.user._id);
    const { turns: historyTurns } = await answeredTurns(user._id, { excludeId: session._id });
    session.report = await buildReport(session, { user, historyTurns, samples: session.presentationSamples || [] });
    session.presentation = session.report.presentation;
    session.status = 'completed';
    session.completedAt = new Date();
    session.markModified('turns');
    await session.save();
    res.json({ interview: view(session, req.user) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await loadOwned(req.params.id, req.user._id);
    if (session.recording && session.recording.fileId) await db.deleteFile(session.recording.fileId);
    await session.deleteOne();
    res.json({ ok: true });
  })
);

module.exports = { router, objectId };
