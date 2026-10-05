'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const { validate } = require('../middleware/validate');
const { sign, setAuthCookie, clearAuthCookie, requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { HttpError, asyncHandler } = require('../utils/httpError');
const { STREAMS } = require('../services/data/streams');

const router = express.Router();
const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const streamIds = STREAMS.map((s) => s.id);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password needs at least one letter and one number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password,
  stream: z.enum(streamIds).optional()
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(128)
});

// A real hash so login timing is the same whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, stream } = req.body;
    const exists = await User.exists({ email });
    if (exists) throw new HttpError(409, 'An account with this email already exists. Try signing in.');
    const passwordHash = await bcrypt.hash(req.body.password, ROUNDS);
    const user = await User.create({ name, email, passwordHash, stream: stream || 'bsc-it' });
    setAuthCookie(res, sign(user));
    res.status(201).json({ user: user.toPublic() });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash +failedLogins +lockUntil');
    if (user && user.lockUntil && user.lockUntil > new Date()) {
      throw new HttpError(423, 'Too many failed attempts. This account is locked for 15 minutes.');
    }
    const ok = await bcrypt.compare(req.body.password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        user.failedLogins = (user.failedLogins || 0) + 1;
        if (user.failedLogins >= MAX_FAILS) {
          user.lockUntil = new Date(Date.now() + LOCK_MS);
          user.failedLogins = 0;
        }
        await user.save();
      }
      throw new HttpError(401, 'Email or password is incorrect.');
    }
    if (user.failedLogins || user.lockUntil) {
      user.failedLogins = 0;
      user.lockUntil = null;
      await user.save();
    }
    setAuthCookie(res, sign(user));
    res.json({ user: user.toPublic() });
  })
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

module.exports = { router, password, ROUNDS };
