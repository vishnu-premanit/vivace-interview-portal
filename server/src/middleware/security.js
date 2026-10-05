'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/** Strip keys that could be used for NoSQL operator injection ($gt, a.b) from bodies. */
function sanitize(value, depth = 0) {
  if (depth > 20) return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Buffer)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitize(req.body);
  next();
}

const skip = () => env.rateLimitDisabled;
const json = (message) => ({ error: message });

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: json('Too many requests — slow down a little.') });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: json('Too many sign-in attempts. Try again in 15 minutes.') });
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: json('You are going a bit fast for the AI. Wait a moment and try again.') });
const uploadLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: json('Upload limit reached for this hour.') });

module.exports = { sanitize, sanitizeBody, apiLimiter, authLimiter, aiLimiter, uploadLimiter };
