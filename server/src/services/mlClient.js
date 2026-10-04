'use strict';
const env = require('../config/env');

/**
 * Client for the Python FastAPI ML service. Optional: if ML_SERVICE_URL is not
 * set or the service is down, every function resolves to null and callers use
 * the JS engines instead.
 */

let healthyUntil = 0;
let downUntil = 0;

async function post(path, body, timeoutMs = 4000) {
  if (!env.mlServiceUrl || Date.now() < downUntil) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.mlServiceUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`ML service ${res.status}`);
    healthyUntil = Date.now() + 60_000;
    return await res.json();
  } catch (err) {
    downUntil = Date.now() + 30_000;
    if (!env.isTest) console.warn('[ml] unavailable, using JS engines:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function status() {
  if (!env.mlServiceUrl) return 'disabled';
  if (Date.now() < healthyUntil) return 'up';
  try {
    const res = await fetch(`${env.mlServiceUrl}/health`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      healthyUntil = Date.now() + 60_000;
      return 'up';
    }
  } catch {
    /* fall through */
  }
  return 'down';
}

module.exports = {
  analyzeAnswer: (payload) => post('/v1/analyze/answer', payload),
  matchJd: (payload) => post('/v1/match', payload),
  predictOutcome: (features) => post('/v1/predict/outcome', { features }),
  status
};
