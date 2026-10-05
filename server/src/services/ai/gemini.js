'use strict';
const env = require('../../config/env');

/**
 * Thin Gemini wrapper. Every call resolves to `null` on any failure so callers
 * can fall back to the offline engines — the portal never breaks because the
 * AI is missing, slow, rate-limited or returns junk.
 */

let client = null;
let failures = 0;
let openUntil = 0;
let lastError = null; // { message, at } — surfaced on /api/health so a bad key is easy to spot
let lastOkAt = null;
let lastDeep = null;

function cleanError(err) {
  const raw = err && err.message ? String(err.message) : String(err);
  // Never echo anything that looks like a key back out.
  return raw.replace(/AIza[0-9A-Za-z_-]{10,}|AQ\.[0-9A-Za-z_.-]{20,}/g, '[key]').slice(0, 300);
}

function markOk() {
  failures = 0;
  lastOkAt = new Date().toISOString();
}

function getClient() {
  if (!env.geminiKey) return null;
  if (!client) {
    const { GoogleGenAI } = require('@google/genai');
    client = new GoogleGenAI({ apiKey: env.geminiKey });
  }
  return client;
}

function isEnabled() {
  return Boolean(env.geminiKey) && Date.now() >= openUntil;
}

function recordFailure(err) {
  failures += 1;
  lastError = { message: cleanError(err), at: new Date().toISOString() };
  if (!env.isTest) console.warn('[gemini] call failed:', err && err.message ? err.message.slice(0, 200) : err);
  if (failures >= 3) {
    openUntil = Date.now() + 60_000; // circuit breaker: back off for a minute
    failures = 0;
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms);
    })
  ]);
}

function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateJson({ system, prompt, temperature = 0.6, timeoutMs = 12000 }) {
  if (!isEnabled()) return null;
  try {
    const ai = getClient();
    const res = await withTimeout(
      ai.models.generateContent({
        model: env.geminiModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction: system, temperature, responseMimeType: 'application/json', maxOutputTokens: 2048 }
      }),
      timeoutMs
    );
    const data = extractJson(res.text);
    if (!data) throw new Error('Gemini returned non-JSON output');
    markOk();
    return data;
  } catch (err) {
    recordFailure(err);
    return null;
  }
}

async function generateText({ system, prompt, history = [], temperature = 0.7, timeoutMs = 15000 }) {
  if (!isEnabled()) return null;
  try {
    const ai = getClient();
    const contents = [
      ...history.map((h) => ({ role: h.role === 'coach' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: prompt }] }
    ];
    const res = await withTimeout(
      ai.models.generateContent({ model: env.geminiModel, contents, config: { systemInstruction: system, temperature, maxOutputTokens: 1024 } }),
      timeoutMs
    );
    markOk();
    return res.text ? String(res.text).trim() : null;
  } catch (err) {
    recordFailure(err);
    return null;
  }
}

async function transcribe(buffer, mimeType, language = 'en') {
  if (!isEnabled() || !buffer || !buffer.length) return null;
  try {
    const ai = getClient();
    const res = await withTimeout(
      ai.models.generateContent({
        model: env.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType || 'audio/webm', data: buffer.toString('base64') } },
              { text: `Transcribe this interview answer verbatim in language code "${language}". Keep filler words such as um, uh, like. Return only the transcript text.` }
            ]
          }
        ],
        config: { temperature: 0 }
      }),
      30000
    );
    markOk();
    return res.text ? String(res.text).trim() : null;
  } catch (err) {
    recordFailure(err);
    return null;
  }
}

/** Status for /api/health. With deep=true, makes one tiny real call to prove the key and model work. */
async function status({ deep = false } = {}) {
  if (!env.geminiKey) return { state: 'offline', model: null };
  const base = { model: env.geminiModel, lastOkAt, lastError };
  // The deep check is public, so cache it: at most one real Gemini call every 30 seconds.
  if (deep && lastDeep && Date.now() - lastDeep.at < 30_000) return lastDeep.result;
  if (deep) {
    const remember = (result) => {
      lastDeep = { at: Date.now(), result };
      return result;
    };
    try {
      const ai = getClient();
      const res = await withTimeout(ai.models.generateContent({ model: env.geminiModel, contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }], config: { temperature: 0, maxOutputTokens: 5 } }), 15000);
      markOk();
      return remember({ ...base, state: 'working', lastOkAt, reply: String(res.text || '').trim().slice(0, 20) });
    } catch (err) {
      recordFailure(err);
      return remember({ ...base, state: 'failing', lastError });
    }
  }
  if (Date.now() < openUntil) return { ...base, state: 'failing' };
  if (lastError && (!lastOkAt || lastError.at > lastOkAt)) return { ...base, state: 'failing' };
  return { ...base, state: lastOkAt ? 'working' : 'configured' };
}

// Test hook
function _reset() {
  client = null;
  failures = 0;
  openUntil = 0;
  lastError = null;
  lastOkAt = null;
  lastDeep = null;
}

module.exports = { generateJson, generateText, transcribe, isEnabled, extractJson, status, _reset };
