'use strict';
const express = require('express');
const { z } = require('zod');
const AbTest = require('../models/AbTest');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { aiLimiter } = require('../middleware/security');
const { asyncHandler } = require('../utils/httpError');
const { compareAnswers } = require('../services/engines/abTest');
const { findQuestion } = require('../services/data/streams');
const gemini = require('../services/ai/gemini');

const router = express.Router();
router.use(requireAuth);

const schema = z.object({
  question: z.string().trim().min(5, 'Add the question you are answering').max(600),
  questionId: z.string().max(80).optional(),
  answerA: z.string().trim().min(10, 'Version A is too short').max(6000),
  answerB: z.string().trim().min(10, 'Version B is too short').max(6000),
  type: z.enum(['technical', 'behavioral', 'situational']).optional().default('behavioral')
});

router.post(
  '/',
  aiLimiter,
  validate(schema),
  asyncHandler(async (req, res) => {
    const { question, questionId, answerA, answerB, type } = req.body;
    const bank = questionId ? findQuestion(questionId) : null;
    const result = compareAnswers({ question, answerA, answerB, keyPoints: bank ? bank.keyPoints : [], type: bank ? bank.type : type });
    result.source = 'offline';
    if (gemini.isEnabled()) {
      const data = await gemini.generateJson({
        system: 'You compare two versions of an interview answer. Respond only with JSON.',
        prompt: `Question: ${question}\nVersion A: """${answerA}"""\nVersion B: """${answerB}"""\nReturn JSON {"verdict":"one sentence on which is stronger and why","improved":"a rewritten best-of-both answer under 150 words"}`,
        temperature: 0.4
      });
      if (data && typeof data.verdict === 'string') {
        result.aiVerdict = data.verdict;
        if (typeof data.improved === 'string') result.improved = data.improved;
        result.source = 'gemini';
      }
    }
    const saved = await AbTest.create({ user: req.user._id, question, answerA, answerB, result: { winner: result.winner, delta: result.delta, a: result.a.overall, b: result.b.overall } });
    res.json({ id: saved._id.toString(), result });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const list = await AbTest.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({ tests: list.map((t) => ({ id: t._id.toString(), question: t.question, result: t.result, createdAt: t.createdAt })) });
  })
);

module.exports = { router };
