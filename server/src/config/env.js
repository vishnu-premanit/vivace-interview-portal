'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function required(name, fallback) {
  const value = process.env[name];
  if (value) return value;
  if (isProd && fallback === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return fallback;
}

const jwtSecret = process.env.JWT_SECRET || (isProd ? '' : 'dev-only-insecure-secret-change-me-please-0123456789');
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production');
}

module.exports = {
  isProd,
  isTest,
  port: Number(process.env.PORT) || 8080,
  mongoUri: required('MONGODB_URI', ''),
  jwtSecret,
  jwtExpires: process.env.JWT_EXPIRES || '2d',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  mlServiceUrl: (process.env.ML_SERVICE_URL || '').replace(/\/$/, ''),
  clientDist: process.env.CLIENT_DIST || path.resolve(__dirname, '../../../client/dist/client/browser'),
  corsOrigin: process.env.CORS_ORIGIN || '',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 40,
  rateLimitDisabled: process.env.RATE_LIMIT_DISABLED === 'true' && !isProd
};
