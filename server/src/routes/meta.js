'use strict';
const express = require('express');
const { STREAMS, PERSONAS, LANGUAGES, COMPETENCIES, COMMON } = require('../services/data/streams');
const gemini = require('../services/ai/gemini');
const ml = require('../services/mlClient');
const db = require('../db/mongo');

const router = express.Router();

router.get('/meta', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    streams: STREAMS.map((s) => ({ id: s.id, name: s.name, full: s.full, group: s.group, roles: s.roles, questionCount: s.questions.length })),
    personas: PERSONAS,
    languages: LANGUAGES,
    competencies: COMPETENCIES,
    sampleQuestions: COMMON.slice(0, 8).map((q) => ({ id: q.id, text: q.text, type: q.type }))
  });
});

router.get('/health', async (req, res) => {
  const deep = req.query.deep === '1';
  const [mlStatus, aiStatus] = await Promise.all([ml.status(), gemini.status({ deep })]);
  // "ai" stays "gemini" / "offline" for compatibility; "aiStatus" says whether Gemini calls actually succeed.
  res.json({
    status: db.isConnected() ? 'ok' : 'degraded',
    db: db.isConnected() ? 'up' : 'down',
    ai: aiStatus.state === 'offline' ? 'offline' : 'gemini',
    aiStatus,
    ml: mlStatus,
    time: new Date().toISOString()
  });
});

module.exports = { router };
