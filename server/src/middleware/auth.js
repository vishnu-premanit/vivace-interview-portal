'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { HttpError } = require('../utils/httpError');

const COOKIE = 'vivace_token';

function sign(user) {
  return jwt.sign({ sub: user._id.toString(), v: user.tokenVersion || 0 }, env.jwtSecret, {
    expiresIn: env.jwtExpires,
    issuer: 'vivace',
    audience: 'vivace-web',
    algorithm: 'HS256'
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: '/api',
    maxAge: 2 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/api', httpOnly: true, sameSite: 'strict', secure: env.isProd });
}

function readToken(req) {
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies ? req.cookies[COOKIE] : null;
}

async function requireAuth(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Please sign in to continue.');
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret, { issuer: 'vivace', audience: 'vivace-web', algorithms: ['HS256'] });
    } catch {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    const user = await User.findById(payload.sub);
    if (!user || (user.tokenVersion || 0) !== payload.v) throw new HttpError(401, 'Your session has expired. Please sign in again.');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { sign, setAuthCookie, clearAuthCookie, requireAuth, COOKIE };
