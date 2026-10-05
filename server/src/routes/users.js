'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const Interview = require('../models/Interview');
const Mistake = require('../models/Mistake');
const CoachMessage = require('../models/CoachMessage');
const AbTest = require('../models/AbTest');
const db = require('../db/mongo');
const { requireAuth, clearAuthCookie, sign, setAuthCookie } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/security');
const { HttpError, asyncHandler } = require('../utils/httpError');
const { STREAMS, LANGUAGES } = require('../services/data/streams');
const { password, ROUNDS } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    stream: z.enum(STREAMS.map((s) => s.id)).optional(),
    targetRole: z.string().trim().max(100).optional(),
    language: z.enum(LANGUAGES.map((l) => l.code)).optional(),
    preferences: z.object({ lowPower: z.boolean().optional(), voiceRate: z.number().min(0.6).max(1.6).optional() }).optional()
  })
  .strict();

router.patch(
  '/me',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const user = req.user;
    const { preferences, ...rest } = req.body;
    Object.assign(user, rest);
    if (preferences) user.preferences = { ...user.preferences.toObject?.() ?? user.preferences, ...preferences };
    await user.save();
    res.json({ user: user.toPublic() });
  })
);

const passwordSchema = z.object({ current: z.string().min(1).max(128), next: password });

router.post(
  '/me/password',
  authLimiter,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.current, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect.');
    user.passwordHash = await bcrypt.hash(req.body.next, ROUNDS);
    user.tokenVersion += 1; // sign out other devices
    await user.save();
    setAuthCookie(res, sign(user));
    res.json({ ok: true });
  })
);

const deleteSchema = z.object({ password: z.string().min(1).max(128) });

router.delete(
  '/me',
  authLimiter,
  validate(deleteSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.password, user.passwordHash))) throw new HttpError(400, 'Password is incorrect.');
    const files = await db.getBucket().find({ 'metadata.user': user._id.toString() }).toArray();
    await Promise.all(files.map((f) => db.deleteFile(f._id)));
    await Promise.all([
      Interview.deleteMany({ user: user._id }),
      Mistake.deleteMany({ user: user._id }),
      CoachMessage.deleteMany({ user: user._id }),
      AbTest.deleteMany({ user: user._id })
    ]);
    await user.deleteOne();
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

module.exports = { router };
